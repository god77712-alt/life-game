// 파이프라인 2단계: position(9존 + 4벽) → 12×10 그리드 좌표.
// 순수 함수. API 키도 브라우저 API도 쓰지 않는다.

import { GRID_W, GRID_H, WALL_TYPES } from './schema.js';

// 테두리 한 칸은 벽. 바닥은 x 1..10, y 1..8.
const IN_X0 = 1, IN_X1 = GRID_W - 2;
const IN_Y0 = 1, IN_Y1 = GRID_H - 2;

// 존 밴드 (room-vision.md의 3×3 분할을 바닥 안쪽으로 클램프)
const X_BANDS = { left: [1, 3], center: [4, 7], right: [8, 10] };
const Y_BANDS = { top: [1, 2], mid: [3, 6], bottom: [7, 8] };

const ZONE_OF = {
  'top-left': ['left', 'top'], 'top-center': ['center', 'top'], 'top-right': ['right', 'top'],
  'mid-left': ['left', 'mid'], center: ['center', 'mid'], 'mid-right': ['right', 'mid'],
  'bottom-left': ['left', 'bottom'], 'bottom-center': ['center', 'bottom'], 'bottom-right': ['right', 'bottom'],
};

// 차지하는 타일 수
const FOOT = { large: { w: 3, h: 2 }, medium: { w: 2, h: 1 }, small: { w: 1, h: 1 } };
const WALL_LEN = { large: 3, medium: 2, small: 1 };

/**
 * 검증된 비전 JSON → 배치가 끝난 방.
 *
 * @param {{room_shape: string, objects: Array, messiness: number}} room
 * @returns {{
 *   width: number, height: number, roomShape: string, messiness: number,
 *   objects: Array, collision: number[][], spawn: {x: number, y: number},
 *   doorTile: {x: number, y: number} | null, unplaced: Array
 * }}
 */
export function buildRoom(room) {
  const occ = makeGrid(); // null = 빈 칸, '#' = 벽, 그 외 = 객체 id
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (y === 0 || y === GRID_H - 1 || x === 0 || x === GRID_W - 1) occ[y][x] = '#';
    }
  }

  const placed = [];
  const unplaced = [];
  const counter = new Map();
  const nextId = (type) => {
    const n = (counter.get(type) ?? 0) + 1;
    counter.set(type, n);
    return `${type}_${n}`;
  };

  const objects = room.objects ?? [];
  const wallItems = objects.filter((o) => WALL_TYPES.has(o.type));
  const floorItems = objects.filter((o) => !WALL_TYPES.has(o.type));

  // 1) 벽 부착물. door를 먼저 놓아 벽 중앙을 확보한다.
  const wallOrder = [...wallItems].sort((a, b) => (a.type === 'door' ? -1 : b.type === 'door' ? 1 : 0));
  const wallUsed = { 'top-wall': [], 'bottom-wall': [], 'left-wall': [], 'right-wall': [] };
  const doorTiles = [];   // 맵 하나에 문이 여럿일 수 있다 (거실은 방 쪽·현관 쪽 둘)

  for (const o of wallOrder) {
    const spot = placeOnWall(o, wallUsed);
    if (!spot) { unplaced.push(o); continue; }
    const id = nextId(o.type);
    const entry = { id, ...o, ...spot, onWall: true, walkable: o.type === 'door' };
    fill(occ, entry, id);
    placed.push(entry);
    if (o.type === 'door') doorTiles.push({ id, x: spot.x, y: spot.y, position: o.position });
  }

  // 문 앞 1타일 + 방 중앙까지의 통로를 예약한다.
  // 앞 한 칸만 비우면 가구가 그 옆을 둘러싸 문이 고립될 수 있다 — 방에 갇힌다.
  const doorFronts = doorTiles.map(frontOf);
  const reserved = corridorTiles(doorFronts);
  for (const f of reserved) occ[f.y][f.x] = '~';

  // 2) 바닥 객체. 큰 것부터 자리를 잡는다.
  const rank = { large: 3, medium: 2, small: 1 };
  const ordered = floorItems
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank[b.o.size] - rank[a.o.size] || a.i - b.i)
    .map(({ o }) => o);

  for (const o of ordered) {
    const foot = FOOT[o.size] ?? FOOT.medium;
    const spot = findSpot(occ, o.position, foot.w, foot.h);
    if (!spot) { unplaced.push(o); continue; }
    const id = nextId(o.type);
    const entry = { id, ...o, x: spot.x, y: spot.y, w: foot.w, h: foot.h, onWall: false, walkable: o.type === 'rug' };
    fill(occ, entry, id);
    placed.push(entry);
  }

  for (const f of reserved) occ[f.y][f.x] = null;

  // 3) 스폰 = 침대 앞. 없으면 방 중앙 근처 빈 칸.
  const spawn = findSpawn(occ, placed);

  // 4) 못 닿는 청소 대상은 점수 기회를 잃는다 — 닿는 자리로 옮긴다.
  relocateUnreachableCleanables(occ, placed, spawn);

  return {
    width: GRID_W,
    height: GRID_H,
    roomShape: room.room_shape ?? 'rect',
    messiness: room.messiness ?? 0.5,
    objects: placed,
    collision: toCollision(occ, placed),
    spawn,
    doorTiles,
    doorTile: doorTiles[0] ?? null,   // 문이 하나뿐인 방(사진 맵)을 위한 편의 필드
    unplaced,
  };
}

// ── 벽 배치 ────────────────────────────────────────────────

function placeOnWall(o, wallUsed) {
  // 벽 type인데 바닥 존을 받은 경우. 검증을 거친 입력에는 없지만,
  // 손으로 쓴 맵과 골 맵은 검증을 건너뛰므로 여기서 막지 않으면 게임이 멈춘다.
  const used = wallUsed[o.position];
  if (!used) return null;

  const len = WALL_LEN[o.size] ?? 1;
  const horizontal = o.position === 'top-wall' || o.position === 'bottom-wall';
  const [lo, hi] = horizontal ? [IN_X0, IN_X1] : [IN_Y0, IN_Y1]; // 모서리는 피한다
  const center = Math.floor((lo + hi + 1 - len) / 2);

  for (let step = 0; step <= hi - lo; step++) {
    for (const dir of step === 0 ? [0] : [-1, 1]) {
      const start = center + dir * step;
      if (start < lo || start + len - 1 > hi) continue;
      if (used.some(([s, e]) => start <= e && start + len - 1 >= s)) continue;
      used.push([start, start + len - 1]);
      return horizontal
        ? { x: start, y: o.position === 'top-wall' ? 0 : GRID_H - 1, w: len, h: 1 }
        : { x: o.position === 'left-wall' ? 0 : GRID_W - 1, y: start, w: 1, h: len };
    }
  }
  return null;
}

// 방 중앙 — 모든 통로가 여기서 만난다. 하나로 이어지므로 어느 문에서든 서로 닿는다.
const HUB_X = Math.floor((IN_X0 + IN_X1) / 2);
const HUB_Y = Math.floor((IN_Y0 + IN_Y1) / 2);

/** 각 문 앞에서 방 중앙까지 L자 통로. 여기엔 아무것도 놓지 않는다. */
function corridorTiles(fronts) {
  const out = new Map();
  const put = (x, y) => out.set(`${x},${y}`, { x, y });

  for (const f of fronts) {
    put(f.x, f.y);
    let { x, y } = f;
    while (x !== HUB_X) { x += Math.sign(HUB_X - x); put(x, y); }
    while (y !== HUB_Y) { y += Math.sign(HUB_Y - y); put(x, y); }
  }
  return [...out.values()];
}

function frontOf(tile) {
  if (tile.y === 0) return { x: tile.x, y: 1 };
  if (tile.y === GRID_H - 1) return { x: tile.x, y: GRID_H - 2 };
  if (tile.x === 0) return { x: 1, y: tile.y };
  return { x: GRID_W - 2, y: tile.y };
}

// ── 바닥 배치 ──────────────────────────────────────────────

function findSpot(occ, position, w, h) {
  const [xb, yb] = ZONE_OF[position] ?? ZONE_OF.center;
  const zx = X_BANDS[xb];
  const zy = Y_BANDS[yb];
  const cx = (zx[0] + zx[1] + 1) / 2;
  const cy = (zy[0] + zy[1] + 1) / 2;

  const cands = [];
  for (let y = IN_Y0; y + h - 1 <= IN_Y1; y++) {
    for (let x = IN_X0; x + w - 1 <= IN_X1; x++) {
      if (!isFree(occ, x, y, w, h)) continue;
      const mx = x + w / 2;
      const my = y + h / 2;
      const inZone = mx >= zx[0] && mx <= zx[1] + 1 && my >= zy[0] && my <= zy[1] + 1;
      cands.push({ x, y, inZone, d: (mx - cx) ** 2 + (my - cy) ** 2 });
    }
  }
  if (!cands.length) return null;

  // 존 안을 먼저, 그 안에서는 존 중심에 가까운 순
  cands.sort((a, b) => (a.inZone === b.inZone ? a.d - b.d : a.inZone ? -1 : 1));
  return cands[0];
}

function isFree(occ, x, y, w, h) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (occ[j][i] !== null) return false;
    }
  }
  return true;
}

function fill(occ, entry, id) {
  for (let j = entry.y; j < entry.y + entry.h; j++) {
    for (let i = entry.x; i < entry.x + entry.w; i++) {
      if (j >= 0 && j < GRID_H && i >= 0 && i < GRID_W) occ[j][i] = id;
    }
  }
}

// ── 스폰 / 도달성 ──────────────────────────────────────────

function findSpawn(occ, placed) {
  const bed = placed.find((o) => o.type === 'bed');
  if (bed) {
    for (const t of ringOf(bed)) {
      if (inFloor(t.x, t.y) && occ[t.y][t.x] === null) return t;
    }
  }
  const mid = { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
  let best = null;
  for (let y = IN_Y0; y <= IN_Y1; y++) {
    for (let x = IN_X0; x <= IN_X1; x++) {
      if (occ[y][x] !== null) continue;
      const d = (x - mid.x) ** 2 + (y - mid.y) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: IN_X0, y: IN_Y0 };
}

function ringOf(o) {
  const out = [];
  for (let i = o.x; i < o.x + o.w; i++) { out.push({ x: i, y: o.y + o.h }); out.push({ x: i, y: o.y - 1 }); }
  for (let j = o.y; j < o.y + o.h; j++) { out.push({ x: o.x + o.w, y: j }); out.push({ x: o.x - 1, y: j }); }
  return out;
}

function inFloor(x, y) {
  return x >= IN_X0 && x <= IN_X1 && y >= IN_Y0 && y <= IN_Y1;
}

function reachableFrom(occ, spawn) {
  const seen = new Set();
  if (!inFloor(spawn.x, spawn.y)) return seen;
  const q = [spawn];
  seen.add(`${spawn.x},${spawn.y}`);
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (!inFloor(nx, ny) || seen.has(key) || occ[ny][nx] !== null) continue;
      seen.add(key);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// 청소 대상은 하나가 곧 L1 +15점 하나다. 가구 뒤에 갇히면 그 점수가 사라진다.
function relocateUnreachableCleanables(occ, placed, spawn) {
  const reach = reachableFrom(occ, spawn);
  const touches = (o) => ringOf(o).some((t) => reach.has(`${t.x},${t.y}`));

  for (const o of placed) {
    if (!o.cleanable || o.onWall || touches(o)) continue;

    const slot = [...reach]
      .map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
      .filter((t) => isFree(occ, t.x, t.y, o.w, o.h))
      .sort((a, b) => (a.x - o.x) ** 2 + (a.y - o.y) ** 2 - ((b.x - o.x) ** 2 + (b.y - o.y) ** 2))[0];
    if (!slot) continue;

    for (let j = o.y; j < o.y + o.h; j++) {
      for (let i = o.x; i < o.x + o.w; i++) occ[j][i] = null;
    }
    o.x = slot.x;
    o.y = slot.y;
    o.relocated = true;
    fill(occ, o, o.id);
  }
}

// ── 출력 ───────────────────────────────────────────────────

function toCollision(occ, placed) {
  const walkable = new Set(placed.filter((o) => o.walkable).map((o) => o.id));
  const grid = [];
  for (let y = 0; y < GRID_H; y++) {
    grid.push([]);
    for (let x = 0; x < GRID_W; x++) {
      const cell = occ[y][x];
      grid[y].push(cell === null || walkable.has(cell) ? 0 : 1);
    }
  }
  return grid;
}

function makeGrid() {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
}

// ── 디버그 뷰 (터미널) ─────────────────────────────────────

const GLYPH = {
  bed: 'B', desk: 'D', chair: 'c', wardrobe: 'W', shelf: 'S', drawer: 'd', table: 'T',
  monitor: 'M', pc: 'P', tv: 'V', console: 'G', fan: 'f', aircon: 'A',
  window: '=', door: '+', curtain: '|',
  rug: 'r', clothes_pile: 'o', trash_pile: 'x', box: 'b', laundry_basket: 'L',
  cup: 'u', bottle: 't', book_stack: 'k', plant: 'p', poster: '.', mirror: 'm', lamp: 'l',
};

/** 배치 결과를 아스키로 그린다. 시연 영상의 디버그 뷰이자 개발 중 눈 확인용. */
export function renderAscii(built) {
  const g = Array.from({ length: built.height }, (_, y) =>
    Array.from({ length: built.width }, (_, x) =>
      y === 0 || y === built.height - 1 || x === 0 || x === built.width - 1 ? '#' : ' '
    )
  );
  for (const o of built.objects) {
    const ch = GLYPH[o.type] ?? '?';
    for (let j = o.y; j < o.y + o.h; j++) {
      for (let i = o.x; i < o.x + o.w; i++) {
        if (j >= 0 && j < built.height && i >= 0 && i < built.width) g[j][i] = ch;
      }
    }
  }
  g[built.spawn.y][built.spawn.x] = '@';

  const legend = [...new Set(built.objects.map((o) => o.type))]
    .map((t) => `${GLYPH[t] ?? '?'}=${t}`)
    .join('  ');
  return g.map((row) => row.join('')).join('\n') + `\n@=spawn  ${legend}`;
}
