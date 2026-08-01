// 고정 맵이 서로 제대로 연결돼 있는지. 끊긴 문 하나면 플레이어가 갇힌다.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAPS, ROOM_EXIT, returnWall, mapList,
  GOAL_ID, registerGoalMap, clearGoalMap,
} from '../src/game/maps.js';
import { buildRoom } from '../src/room/mapper.js';
import { TYPES, WALL_POSITIONS, FLOOR_POSITIONS, GRID_W, GRID_H } from '../src/room/schema.js';

const built = Object.fromEntries(mapList().map((id) => [id, buildRoom(MAPS[id].vision)]));

test('모든 맵이 배치에 실패하지 않는다', () => {
  for (const [id, b] of Object.entries(built)) {
    assert.equal(b.unplaced.length, 0, `${id}: ${b.unplaced.map((o) => o.type)}`);
  }
});

test('손으로 쓴 오브젝트가 전부 유효한 enum이다', () => {
  const positions = new Set([...WALL_POSITIONS, ...FLOOR_POSITIONS]);
  for (const [id, def] of Object.entries(MAPS)) {
    for (const o of def.vision.objects) {
      assert.ok(TYPES.has(o.type), `${id}: 없는 type "${o.type}"`);
      assert.ok(positions.has(o.position), `${id}: 없는 position "${o.position}"`);
    }
  }
});

test('exits에 선언한 벽마다 실제 문이 있다', () => {
  for (const [id, def] of Object.entries(MAPS)) {
    const walls = built[id].doorTiles.map((d) => d.position);
    for (const w of Object.keys(def.exits)) {
      assert.ok(walls.includes(w), `${id}: exits에 ${w}가 있는데 문이 없다`);
    }
    assert.equal(built[id].doorTiles.length, Object.keys(def.exits).length, `${id}: 문 개수 불일치`);
  }
});

test('연결이 양방향이다 — 들어가면 반드시 나올 수 있다', () => {
  for (const [id, def] of Object.entries(MAPS)) {
    for (const [wall, to] of Object.entries(def.exits)) {
      if (to === 'room') continue;                       // 방은 사진 맵이라 여기 없다
      assert.ok(MAPS[to], `${id}의 ${wall}이 없는 맵 "${to}"을 가리킨다`);
      const back = Object.values(MAPS[to].exits);
      assert.ok(back.includes(id), `${to}에서 ${id}로 돌아오는 문이 없다 — 갇힌다`);
      assert.ok(returnWall(id, to), `returnWall(${id}, ${to})가 없다`);
      void wall;
    }
  }
});

test('방에서 나가면 거실이고, 거실에서 방으로 돌아온다', () => {
  assert.equal(ROOM_EXIT, 'living');
  assert.ok(Object.values(MAPS.living.exits).includes('room'));
});

test('모든 맵이 방(room)에서 도달 가능하다 — 고립된 맵이 없다', () => {
  const seen = new Set(['room']);
  const q = [ROOM_EXIT];
  while (q.length) {
    const id = q.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const to of Object.values(MAPS[id].exits)) if (!seen.has(to)) q.push(to);
  }
  for (const id of mapList()) assert.ok(seen.has(id), `${id}에 갈 방법이 없다`);
});

test('문 앞이 전부 통행 가능하다', () => {
  for (const [id, b] of Object.entries(built)) {
    for (const d of b.doorTiles) {
      const f = d.y === 0 ? { x: d.x, y: 1 }
        : d.y === GRID_H - 1 ? { x: d.x, y: GRID_H - 2 }
        : d.x === 0 ? { x: 1, y: d.y } : { x: GRID_W - 2, y: d.y };
      assert.equal(b.collision[f.y][f.x], 0, `${id}: ${d.position} 문 앞이 막혔다`);
      assert.equal(b.collision[d.y][d.x], 0, `${id}: ${d.position} 문 자체가 막혔다`);
    }
  }
});

test('모든 문이 spawn에서 걸어서 닿는다', () => {
  for (const [id, b] of Object.entries(built)) {
    const seen = new Set([`${b.spawn.x},${b.spawn.y}`]);
    const q = [b.spawn];
    while (q.length) {
      const { x, y } = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = `${nx},${ny}`;
        if (nx < 1 || ny < 1 || nx > GRID_W - 2 || ny > GRID_H - 2) continue;
        if (seen.has(k) || b.collision[ny][nx] === 1) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
    for (const d of b.doorTiles) {
      const f = d.y === 0 ? { x: d.x, y: 1 }
        : d.y === GRID_H - 1 ? { x: d.x, y: GRID_H - 2 }
        : d.x === 0 ? { x: 1, y: d.y } : { x: GRID_W - 2, y: d.y };
      assert.ok(seen.has(`${f.x},${f.y}`), `${id}: ${d.position} 문 앞에 도달 불가`);
    }
  }
});

test('무대 자리(slot)가 가구에 막혀 있지 않다', () => {
  // 막힌 자리는 프롭이 조용히 버려진다 — 디렉터가 짠 무대가 화면에 안 나온다
  for (const [id, def] of Object.entries(MAPS)) {
    for (const s of def.slots ?? []) {
      assert.equal(built[id].collision[s.y][s.x], 0,
        `${id}: slot ${s.id}(${s.x},${s.y})이 막혀 있다`);
    }
  }
});

test('무대 자리에 서면 플레이어가 갇히지 않는다', () => {
  // 프롭이 놓이면 그 칸은 통행 불가가 된다. 통로 한가운데면 길이 끊긴다.
  for (const [id, def] of Object.entries(MAPS)) {
    const b = built[id];
    for (const s of def.slots ?? []) {
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([dx, dy]) => b.collision[s.y + dy]?.[s.x + dx] === 0).length;
      assert.ok(around >= 2, `${id}: slot ${s.id} 주변이 ${around}칸뿐 — 프롭이 길을 막는다`);
    }
  }
});

test('방 밖 공간은 전부 L2 +30', () => {
  for (const [id, def] of Object.entries(MAPS)) {
    assert.equal(def.tier, 'L2', id);
    assert.equal(def.score, 30, id);
    assert.ok(def.label && def.arrive, `${id}: 라벨·도착 문구가 필요하다`);
  }
});

// ── 골 맵 ───────────────────────────────────────────────────
// 가설이 confirmed 될 때 딱 한 번 붙는다. 여기가 막히면 엔딩이 통째로 안 나온다.

const GOAL = {
  label: '새벽 골목 안쪽',
  theme: 'street',
  arrive: '안쪽으로 한 칸 더 들어오면 바람이 덜 분다.',
  reason: '대면 전달이 문턱이라 주고받는 자리를 없앴다',
  objects: [
    { type: 'door', position: 'top-wall', size: 'medium', cleanable: false },
    { type: 'door', position: 'left-wall', size: 'medium', cleanable: false },   // 여분 문 — 버려져야 한다
    { type: 'box', position: 'mid-left', size: 'medium', cleanable: false },
    { type: 'chair', position: 'bottom-left', size: 'medium', cleanable: false },
    { type: 'lamp', position: 'top-center', size: 'small', cleanable: false },
    { type: 'plant', position: 'top-right', size: 'large', cleanable: false },
    { type: 'rug', position: 'center', size: 'large', cleanable: false },
    { type: 'shelf', position: 'mid-right', size: 'large', cleanable: false },
  ],
  mirror: { name: '그릇을 두고 가는 사람', look: 'person', detail: 'd', opening: 'o', speech: 's', stuck: 'k', wants: 'w' },
};

test('골 맵은 confirmed 전까지 없다', () => {
  clearGoalMap();
  assert.equal(MAPS[GOAL_ID], undefined);
  assert.equal(MAPS.street.exits['bottom-wall'], undefined);
});

test('골 맵을 붙이면 골목에서 갈 수 있고 돌아올 수 있다', () => {
  clearGoalMap();
  assert.equal(registerGoalMap(GOAL), true);
  assert.equal(MAPS.street.exits['bottom-wall'], GOAL_ID);
  assert.equal(MAPS[GOAL_ID].exits['top-wall'], 'street');
  assert.equal(returnWall(GOAL_ID, 'street'), 'bottom-wall');
  assert.equal(registerGoalMap(GOAL), false, '두 번 붙지 않는다');
  clearGoalMap();
});

test('골 맵의 문은 top-wall 하나뿐이다 — 여분 문은 버린다', () => {
  clearGoalMap();
  registerGoalMap(GOAL);
  const doors = MAPS[GOAL_ID].vision.objects.filter((o) => o.type === 'door');
  assert.equal(doors.length, 1);
  assert.equal(doors[0].position, 'top-wall');
  clearGoalMap();
});

test('골 맵도 배치에 실패하지 않고 문 앞이 뚫려 있다', () => {
  clearGoalMap();
  registerGoalMap(GOAL);
  const b = buildRoom(MAPS[GOAL_ID].vision);
  assert.equal(b.unplaced.length, 0);
  const d = b.doorTiles[0];
  assert.equal(b.collision[1][d.x], 0, '문 앞이 막혔다');
  const slot = MAPS[GOAL_ID].slots[0];
  assert.equal(b.collision[slot.y][slot.x], 0, '거울이 설 자리가 막혔다');
  clearGoalMap();
});

test('골 맵 도달은 L4 +80이다', () => {
  clearGoalMap();
  registerGoalMap(GOAL);
  assert.equal(MAPS[GOAL_ID].tier, 'L4');
  assert.equal(MAPS[GOAL_ID].score, 80);
  clearGoalMap();
});

test('clearGoalMap이 골목을 원래대로 되돌린다 — 새 게임에 문이 남으면 안 된다', () => {
  const before = MAPS.street.vision.objects.length;
  registerGoalMap(GOAL);
  clearGoalMap();
  assert.equal(MAPS.street.vision.objects.length, before);
  assert.equal(MAPS.street.exits['bottom-wall'], undefined);
});

test('거울 자리는 매번 새로 찾는다 — 시작 칸·가구·막다른 칸을 피한다', () => {
  clearGoalMap();
  registerGoalMap(GOAL);
  const b = buildRoom(MAPS[GOAL_ID].vision);
  const s = MAPS[GOAL_ID].slots[0];

  assert.equal(b.collision[s.y][s.x], 0, '가구 위에 섰다');
  assert.ok(!(s.x === b.spawn.x && s.y === b.spawn.y), '플레이어 시작 칸과 겹쳤다');
  const open = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([dx, dy]) => b.collision[s.y + dy]?.[s.x + dx] === 0).length;
  assert.ok(open >= 2, `막다른 칸(${open}칸) — 거울이 길을 막는다`);
  clearGoalMap();
});
