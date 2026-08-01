import test from 'node:test';
import assert from 'node:assert/strict';

import { validateVision, DEFAULT_ROOM, GRID_W, GRID_H, MAX_OBJECTS } from '../src/room/schema.js';
import { buildRoom, renderAscii } from '../src/room/mapper.js';

const EXAMPLE = {
  room_shape: 'rect',
  objects: [
    { type: 'bed', position: 'top-left', size: 'large', cleanable: false },
    { type: 'desk', position: 'mid-right', size: 'medium', cleanable: false },
    { type: 'monitor', position: 'mid-right', size: 'medium', cleanable: false },
    { type: 'chair', position: 'center', size: 'medium', cleanable: false },
    { type: 'clothes_pile', position: 'bottom-center', size: 'small', cleanable: true },
    { type: 'trash_pile', position: 'mid-left', size: 'small', cleanable: true },
    { type: 'cup', position: 'mid-right', size: 'small', cleanable: true },
    { type: 'window', position: 'top-wall', size: 'medium', cleanable: false },
    { type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false },
  ],
  messiness: 0.7,
};

const build = (raw) => buildRoom(validateVision(raw).room);

// ── 검증 ───────────────────────────────────────────────────

test('스키마 밖 type은 조용히 드롭된다', () => {
  const { room, dropped } = validateVision({
    ...EXAMPLE,
    objects: [...EXAMPLE.objects, { type: 'gundam_figure', position: 'center', size: 'small' }],
  });
  assert.ok(!room.objects.some((o) => o.type === 'gundam_figure'));
  assert.equal(dropped.filter((d) => d.reason.startsWith('unknown-type')).length, 1);
});

test('bed·door·window는 없으면 주입된다', () => {
  const { room } = validateVision({
    room_shape: 'rect',
    objects: [
      { type: 'desk', position: 'center', size: 'medium' },
      { type: 'chair', position: 'center', size: 'medium' },
      { type: 'cup', position: 'mid-left', size: 'small' },
    ],
    messiness: 0.3,
  });
  assert.ok(room.objects.some((o) => o.type === 'bed'));
  assert.ok(room.objects.some((o) => o.type === 'door'));
  assert.ok(room.objects.some((o) => o.type === 'window'), '밝기 피드백이 죽는다');
});

test('커튼이 있으면 window를 따로 주입하지 않는다', () => {
  const { room } = validateVision({
    room_shape: 'rect',
    objects: [
      { type: 'bed', position: 'top-left', size: 'large' },
      { type: 'curtain', position: 'left-wall', size: 'medium' },
      { type: 'desk', position: 'center', size: 'medium' },
    ],
    messiness: 0.4,
  });
  assert.equal(room.objects.filter((o) => o.type === 'window').length, 0);
  assert.equal(room.objects.filter((o) => o.type === 'curtain').length, 1);
});

test('모든 방에 밝기를 올릴 수단이 하나는 있다', () => {
  for (const raw of [
    null,
    { objects: [] },
    { room_shape: 'rect', objects: [{ type: 'desk', position: 'center', size: 'large' }, { type: 'chair', position: 'center' }], messiness: 0.5 },
    EXAMPLE,
  ]) {
    const { room } = validateVision(raw);
    const lit = room.objects.some((o) => o.type === 'window' || o.type === 'curtain');
    assert.ok(lit, 'window/curtain 없는 방 — 영원히 어두워진다');
  }
});

test('cleanable은 프롬프트 값이 아니라 type으로 교정된다', () => {
  const { room } = validateVision({
    ...EXAMPLE,
    objects: [
      ...EXAMPLE.objects,
      { type: 'trash_pile', position: 'top-right', size: 'small', cleanable: false },
      { type: 'wardrobe', position: 'top-center', size: 'large', cleanable: true },
    ],
  });
  assert.ok(room.objects.filter((o) => o.type === 'trash_pile').every((o) => o.cleanable));
  assert.equal(room.objects.find((o) => o.type === 'wardrobe').cleanable, false);
});

test('벽 type이 바닥 존을 받으면 벽으로 교정된다', () => {
  const { room } = validateVision({
    ...EXAMPLE,
    objects: EXAMPLE.objects.map((o) => (o.type === 'window' ? { ...o, position: 'center' } : o)),
  });
  assert.equal(room.objects.find((o) => o.type === 'window').position, 'top-wall');
});

test('객체는 상한을 넘지 않고 bed/door는 살아남는다', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    type: i % 2 ? 'book_stack' : 'plant',
    position: 'center',
    size: 'small',
  }));
  const { room } = validateVision({ room_shape: 'rect', objects: many, messiness: 0.5 });
  assert.ok(room.objects.length <= MAX_OBJECTS);
  assert.ok(room.objects.some((o) => o.type === 'bed'));
  assert.ok(room.objects.some((o) => o.type === 'door'));
});

test('빈 사진 / 방이 아닌 사진은 기본 레이아웃으로 폴백', () => {
  for (const raw of [null, {}, { objects: [] }, { objects: [{ type: 'nope' }] }]) {
    const { room, fellBack } = validateVision(raw);
    assert.equal(fellBack, true);
    assert.equal(room.objects.length, DEFAULT_ROOM.objects.length);
  }
});

test('messiness는 0~1로 클램프된다', () => {
  assert.equal(validateVision({ ...EXAMPLE, messiness: 4.2 }).room.messiness, 1);
  assert.equal(validateVision({ ...EXAMPLE, messiness: -3 }).room.messiness, 0);
  assert.equal(validateVision({ ...EXAMPLE, messiness: 'x' }).room.messiness, 0.5);
});

// ── 배치 ───────────────────────────────────────────────────

test('모든 객체가 그리드 안에 놓이고 겹치지 않는다', () => {
  const built = build(EXAMPLE);
  assert.equal(built.unplaced.length, 0);

  const seen = new Set();
  for (const o of built.objects) {
    for (let j = o.y; j < o.y + o.h; j++) {
      for (let i = o.x; i < o.x + o.w; i++) {
        assert.ok(i >= 0 && i < GRID_W && j >= 0 && j < GRID_H, `${o.id} 그리드 이탈`);
        const key = `${i},${j}`;
        assert.ok(!seen.has(key), `${o.id} 겹침 @${key}`);
        seen.add(key);
      }
    }
  }
});

test('바닥 객체는 벽 타일을 침범하지 않는다', () => {
  const built = build(EXAMPLE);
  for (const o of built.objects.filter((o) => !o.onWall)) {
    assert.ok(o.x >= 1 && o.x + o.w - 1 <= GRID_W - 2, `${o.id} x 벽 침범`);
    assert.ok(o.y >= 1 && o.y + o.h - 1 <= GRID_H - 2, `${o.id} y 벽 침범`);
  }
});

test('벽 부착물은 테두리에 붙고 모서리를 피한다', () => {
  const built = build(EXAMPLE);
  const wallItems = built.objects.filter((o) => o.onWall);
  assert.ok(wallItems.length >= 2);
  for (const o of wallItems) {
    const onEdge = o.x === 0 || o.y === 0 || o.x + o.w - 1 === GRID_W - 1 || o.y + o.h - 1 === GRID_H - 1;
    assert.ok(onEdge, `${o.id} 벽에 안 붙음`);
    const corner = (o.x === 0 || o.x === GRID_W - 1) && (o.y === 0 || o.y === GRID_H - 1);
    assert.ok(!corner, `${o.id} 모서리 배치`);
  }
});

test('door는 통행 가능하고 앞 1타일이 비어 있다', () => {
  const built = build(EXAMPLE);
  assert.ok(built.doorTile);
  const { x, y } = built.doorTile;
  assert.equal(built.collision[y][x], 0, '문이 막힘');

  const front = y === GRID_H - 1 ? { x, y: y - 1 } : y === 0 ? { x, y: 1 } : x === 0 ? { x: 1, y } : { x: GRID_W - 2, y };
  assert.equal(built.collision[front.y][front.x], 0, '문 앞이 막힘');
});

test('position이 대응하는 존 근처에 배치된다', () => {
  const built = build(EXAMPLE);
  const bed = built.objects.find((o) => o.type === 'bed');
  assert.ok(bed.x <= 3 && bed.y <= 2, `bed가 top-left가 아님 (${bed.x},${bed.y})`);
  const desk = built.objects.find((o) => o.type === 'desk');
  assert.ok(desk.x >= 6, `desk가 mid-right가 아님 (${desk.x},${desk.y})`);
});

test('spawn은 걸을 수 있는 칸이다', () => {
  const built = build(EXAMPLE);
  assert.equal(built.collision[built.spawn.y][built.spawn.x], 0);
});

test('청소 대상은 전부 spawn에서 닿는다 — 점수 기회가 사라지면 안 된다', () => {
  const built = build(EXAMPLE);
  const reach = flood(built);
  for (const o of built.objects.filter((o) => o.cleanable)) {
    const adjacent = ring(o).some((t) => reach.has(`${t.x},${t.y}`));
    assert.ok(adjacent, `${o.id} 도달 불가 — L1 점수 소실`);
  }
});

test('기본 레이아웃도 정상 배치된다', () => {
  const built = buildRoom(DEFAULT_ROOM);
  assert.equal(built.unplaced.length, 0);
  assert.ok(built.doorTile);
  assert.equal(built.objects.filter((o) => o.cleanable).length, 3);
});

test('객체가 꽉 차도 배치가 터지지 않는다', () => {
  const packed = {
    room_shape: 'rect',
    objects: [
      { type: 'bed', position: 'top-left', size: 'large' },
      { type: 'wardrobe', position: 'top-center', size: 'large' },
      { type: 'desk', position: 'top-right', size: 'large' },
      { type: 'table', position: 'center', size: 'large' },
      { type: 'shelf', position: 'mid-left', size: 'large' },
      { type: 'drawer', position: 'mid-right', size: 'large' },
      { type: 'clothes_pile', position: 'bottom-left', size: 'small' },
      { type: 'trash_pile', position: 'bottom-center', size: 'small' },
      { type: 'box', position: 'bottom-right', size: 'small' },
      { type: 'door', position: 'bottom-wall', size: 'medium' },
    ],
    messiness: 0.9,
  };
  const built = build(packed);
  assert.equal(built.unplaced.length, 0);
  const reach = flood(built);
  for (const o of built.objects.filter((o) => o.cleanable)) {
    assert.ok(ring(o).some((t) => reach.has(`${t.x},${t.y}`)), `${o.id} 도달 불가`);
  }
});

test('같은 벽에 여러 개가 붙어도 겹치지 않는다', () => {
  const built = build({
    room_shape: 'rect',
    objects: [
      { type: 'bed', position: 'top-left', size: 'large' },
      { type: 'door', position: 'top-wall', size: 'medium' },
      { type: 'window', position: 'top-wall', size: 'medium' },
      { type: 'curtain', position: 'top-wall', size: 'medium' },
      { type: 'aircon', position: 'top-wall', size: 'small' },
    ],
    messiness: 0.2,
  });
  const seen = new Set();
  for (const o of built.objects.filter((o) => o.onWall)) {
    for (let i = o.x; i < o.x + o.w; i++) {
      assert.ok(!seen.has(i), `벽 겹침 @${i}`);
      seen.add(i);
    }
  }
});

test('large는 4개를 넘지 않는다 — 넘으면 medium으로 강등', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    type: ['wardrobe', 'desk', 'table', 'shelf', 'drawer', 'bed', 'rug', 'tv'][i],
    position: 'center', size: 'large',
  }));
  const { room } = validateVision({ room_shape: 'rect', objects: many, messiness: 0.5 });
  const large = room.objects.filter((o) => o.size === 'large');
  assert.ok(large.length <= 4, `large ${large.length}개`);
  // 잘라내지 않고 강등한다 — 방을 알아보려면 있는 게 낫다
  assert.ok(room.objects.some((o) => o.demoted), '강등된 흔적이 없다');
});

test('문 앞은 어떤 방에서도 spawn에서 걸어서 닿는다', () => {
  // 가구로 문을 둘러싸려는 방들. 통로 예약이 없으면 갇힌다.
  const nasty = [
    { label: '문 주변을 큰 가구로', objects: [
      { type: 'bed', position: 'bottom-left', size: 'large' },
      { type: 'wardrobe', position: 'bottom-center', size: 'large' },
      { type: 'desk', position: 'bottom-right', size: 'large' },
      { type: 'table', position: 'center', size: 'large' },
      { type: 'shelf', position: 'mid-left', size: 'large' },
      { type: 'drawer', position: 'mid-right', size: 'large' },
      { type: 'door', position: 'bottom-wall', size: 'medium' },
    ] },
    { label: '중앙 봉쇄', objects: [
      { type: 'table', position: 'center', size: 'large' },
      { type: 'bed', position: 'center', size: 'large' },
      { type: 'wardrobe', position: 'center', size: 'large' },
      { type: 'shelf', position: 'center', size: 'large' },
      { type: 'drawer', position: 'center', size: 'large' },
      { type: 'door', position: 'left-wall', size: 'medium' },
    ] },
  ];

  for (const raw of [...nasty.map((n) => ({ room_shape: 'rect', objects: n.objects, messiness: 0.5 })), EXAMPLE]) {
    const built = build(raw);
    const reach = flood(built);
    for (const d of built.doorTiles) {
      const f = d.y === 0 ? { x: d.x, y: 1 }
        : d.y === GRID_H - 1 ? { x: d.x, y: GRID_H - 2 }
        : d.x === 0 ? { x: 1, y: d.y } : { x: GRID_W - 2, y: d.y };
      assert.ok(reach.has(`${f.x},${f.y}`), `문(${d.position}) 앞에 도달 불가 — 방에 갇힌다`);
    }
  }
});

test('통로 예약이 배치를 망가뜨리지 않는다', () => {
  const built = build(EXAMPLE);
  assert.equal(built.unplaced.length, 0);
  const bed = built.objects.find((o) => o.type === 'bed');
  assert.ok(bed.x <= 3 && bed.y <= 2, 'bed가 여전히 top-left에 있어야');
});

test('renderAscii는 12×10 격자를 그린다', () => {
  const art = renderAscii(build(EXAMPLE));
  const rows = art.split('\n').slice(0, GRID_H);
  assert.equal(rows.length, GRID_H);
  for (const r of rows) assert.equal(r.length, GRID_W);
  assert.ok(art.includes('@'));
});

// ── 헬퍼 ───────────────────────────────────────────────────

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
