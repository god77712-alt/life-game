// 목 데이터 4개가 전부 렌더 가능한 방으로 조립되는지.
// Phaser 없이 검증 가능한 부분(배치·도달성·화면 범위)만 본다.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateVision, GRID_W, GRID_H } from '../src/room/schema.js';
import { buildRoom, renderAscii } from '../src/room/mapper.js';
import { MOCK_ROOMS } from '../src/room/mock.js';

const TILE = 32;
const ROOM_TOP = TILE;
const CANVAS_W = GRID_W * TILE;   // 384
const CANVAS_H = ROOM_TOP + GRID_H * TILE; // 352

// textures.js의 TALL과 같은 값 — 화면 이탈 검사용
const TALL = {
  wardrobe: 1, shelf: 1, drawer: 0.5, table: 0.25, desk: 0.25, chair: 0.5, bed: 0.25,
  monitor: 0.5, pc: 0.5, tv: 0.5, console: 0.25, fan: 0.75, plant: 0.5, lamp: 0.75,
  bottle: 0.25, book_stack: 0.25, box: 0.25, laundry_basket: 0.25,
};

for (const mock of MOCK_ROOMS) {
  test(`목 방 "${mock.label}" — 조립된다`, () => {
    const { room } = validateVision(mock.vision);
    const built = buildRoom(room);

    assert.equal(built.unplaced.length, 0, `배치 실패: ${built.unplaced.map((o) => o.type)}`);
    assert.ok(built.doorTile, 'door 없음');
    assert.equal(built.collision[built.spawn.y][built.spawn.x], 0, 'spawn이 막힘');

    // 겹침 없음
    const seen = new Set();
    for (const o of built.objects) {
      for (let j = o.y; j < o.y + o.h; j++) {
        for (let i = o.x; i < o.x + o.w; i++) {
          assert.ok(!seen.has(`${i},${j}`), `${o.id} 겹침`);
          seen.add(`${i},${j}`);
        }
      }
    }

    // 위로 자란 오브젝트가 화면 밖으로 나가지 않는다
    for (const o of built.objects) {
      const bottomPx = o.onWall && o.y === 0 ? ROOM_TOP + TILE : ROOM_TOP + (o.y + o.h) * TILE;
      const heightPx = o.onWall
        ? (o.position === 'top-wall' ? TILE * 2 : o.h * TILE)
        : Math.round((o.h + (TALL[o.type] ?? 0)) * TILE);
      assert.ok(bottomPx - heightPx >= 0, `${o.id} 위로 이탈 (top ${bottomPx - heightPx})`);
      assert.ok(bottomPx <= CANVAS_H, `${o.id} 아래로 이탈`);
      assert.ok(o.x * TILE >= 0 && (o.x + o.w) * TILE <= CANVAS_W, `${o.id} 좌우 이탈`);
    }

    // 청소 대상은 전부 걸어서 닿는다 = 점수 기회가 살아 있다
    const reach = flood(built);
    for (const o of built.objects.filter((x) => x.cleanable)) {
      assert.ok(ring(o).some((t) => reach.has(`${t.x},${t.y}`)), `${o.id} 도달 불가`);
    }

    // 문 앞도 걸어서 닿는다 = Act 1에서 밖으로 나갈 수 있다
    const d = built.doorTile;
    const front = d.y === GRID_H - 1 ? { x: d.x, y: d.y - 1 }
      : d.y === 0 ? { x: d.x, y: 1 }
      : d.x === 0 ? { x: 1, y: d.y } : { x: GRID_W - 2, y: d.y };
    assert.ok(reach.has(`${front.x},${front.y}`), '문 앞에 도달 불가');
  });
}

test('폴백 방도 렌더 가능하다', () => {
  const fallback = MOCK_ROOMS.at(-1);
  const { fellBack, room } = validateVision(fallback.vision);
  assert.equal(fellBack, true);
  const art = renderAscii(buildRoom(room));
  assert.ok(art.includes('B') && art.includes('+'), '침대/문이 없음');
});

function ring(o) {
  const out = [];
  for (let i = o.x; i < o.x + o.w; i++) { out.push({ x: i, y: o.y + o.h }); out.push({ x: i, y: o.y - 1 }); }
  for (let j = o.y; j < o.y + o.h; j++) { out.push({ x: o.x + o.w, y: j }); out.push({ x: o.x - 1, y: j }); }
  return out;
}

function flood(built) {
  const seen = new Set([`${built.spawn.x},${built.spawn.y}`]);
  const q = [built.spawn];
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 1 || ny < 1 || nx > built.width - 2 || ny > built.height - 2) continue;
      if (seen.has(key) || built.collision[ny][nx] === 1) continue;
      seen.add(key);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}
