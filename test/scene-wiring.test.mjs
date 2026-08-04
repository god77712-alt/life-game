// **연결되어야 할 것이 연결되어 있는가.**
//
// 여기 있는 것은 전부 "각자 맞는데 서로 안 맞는" 종류의 결함이다.
// 부품 시험으로는 안 잡힌다 — errands.js도 shop.js도 각각은 옳았고,
// 씬이 그 둘을 안 이어놨을 뿐이었다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { POINT_PER_SCORE } from '../src/game/shop.js';
import { KINDS } from '../src/game/errands.js';
import * as errands from '../src/game/errands.js';

globalThis.Phaser ??= { Scene: class { constructor() {} } };
const { RoomScene } = await import('../src/scenes/RoomScene.js');

function scene() {
  const s = Object.create(RoomScene.prototype);
  s.resetEnding();
  s.todayScore = 0;
  s.total = 0;
  s.points = 0;
  s.todayLog = [];
  s.affinity = {};
  s.npcNames = new Map();
  s.props = [];
  s.errands = [];
  s.clock = { label: '14:00', day: 1 };
  s.persist = () => {};
  s.overlay = { popAffinity: () => {}, popScore: () => {} };
  return s;
}

// ── 점수와 포인트는 **같이** 들어온다 ────────────────────

test('**점수가 붙는 모든 자리에서 포인트도 붙는다** — 이동만 0P였던 버그', () => {
  const s = scene();
  s.award(30, { label: '편의점 가기', tier: 'L2' });
  assert.equal(s.total, 30);
  assert.equal(s.todayScore, 30);
  assert.equal(s.points, 30 * POINT_PER_SCORE, '갈 데까지 갔는데 살 돈이 안 생기면 상점이 죽는다');
});

test('붕괴 이후엔 점수도 포인트도 0 — 같은 값에서 갈라지므로 어긋날 수가 없다', () => {
  const s = scene();
  s.award(0, { label: '이불 개기', tier: 'L0' });
  assert.equal(s.total, 0);
  assert.equal(s.points, 0);
  assert.equal(s.todayLog.at(-1).score, 0, '정산창에 `+0`으로 남는 것이 연출의 본체다');
});

test('누적은 절대 안 깎인다 — 준 점수만 더한다', () => {
  const s = scene();
  s.award(10, { label: 'a', tier: 'L0' });
  s.award(15, { label: 'b', tier: 'L1' });
  assert.equal(s.total, 25);
  assert.equal(s.todayLog.length, 2, '정산창은 무엇을 했는지 줄로 남는다');
});

// ── 부탁은 실제로 하면 닫힌다 ────────────────────────────

test('**건네주면 `give` 부탁이 닫힌다** — 하고도 안 한 것으로 남던 버그', () => {
  const s = scene();
  s.errands = [{ id: 'e1', npc: 'mom', text: '노숙자한테 담요 좀', kind: 'give',
    target: 'blanket', asked_at: '13:00', done_at: null }];

  s.closeErrands({ kind: 'give', target: 'blanket' });
  assert.ok(s.errands[0].done_at, '실제로 건넸는데 안 닫히면 정산에 "안 함"으로 실린다');
});

test('**다녀오면 `visit` 부탁이 닫힌다**', () => {
  const s = scene();
  s.errands = [{ id: 'e1', npc: 'mom', text: '공원 좀 다녀와', kind: 'visit',
    target: 'park', asked_at: '13:00', done_at: null }];

  s.closeErrands({ kind: 'visit', target: 'park' });
  assert.ok(s.errands[0].done_at);
});

test('듣지 않은 부탁은 우연히 해도 안 닫힌다 — 관계 신호가 부풀려진다', () => {
  const s = scene();
  s.errands = [{ id: 'e1', npc: 'mom', text: '공원 좀', kind: 'visit',
    target: 'park', asked_at: null, done_at: null }];

  s.closeErrands({ kind: 'visit', target: 'park' });
  assert.equal(s.errands[0].done_at, null, '만나서 듣지 않았으면 부탁을 들어준 게 아니다');
});

test('한 행동으로 같은 사람의 호감도가 두 번 오르지 않는다', () => {
  const s = scene();
  const homeless = { key: 'park:prop:b', npc: 'homeless', name: '노숙자' };
  s.errands = [{ id: 'e1', npc: 'homeless', text: '담요…', kind: 'give',
    target: 'blanket', asked_at: '13:00', done_at: null }];

  s.raiseAffinity(homeless, 'favor');            // 건넨 것으로 이미 올랐다
  const once = s.affinity.homeless;
  s.closeErrands({ kind: 'give', target: 'blanket' }, homeless.npc);
  assert.equal(s.affinity.homeless, once, '같은 행동인데 두 번 세면 관계 신호가 부풀려진다');
});

test('시킨 사람이 따로면 그 사람 쪽도 오른다', () => {
  const s = scene();
  const homeless = { key: 'park:prop:b', npc: 'homeless', name: '노숙자' };
  s.errands = [{ id: 'e1', npc: 'mom', text: '담요 좀 갖다줘', kind: 'give',
    target: 'blanket', asked_at: '13:00', done_at: null }];

  s.raiseAffinity(homeless, 'favor');
  s.closeErrands({ kind: 'give', target: 'blanket' }, homeless.npc);
  assert.ok(s.errands[0].done_at, '엄마의 부탁도 닫힌다');
});

// ── 부탁의 target 모양이 씬과 같은가 ─────────────────────

test('**`give` 부탁의 target은 물건이다** — 사람으로 맞추면 영영 안 맞는다', () => {
  const items = KINDS.give.targets([]);
  assert.ok(items.has('blanket'), '아이템 id가 target이다');
  assert.equal(items.has('homeless'), false, 'npc id를 넣으면 accept 단계에서 버려진다');
});

test('why가 붙는다 — 시켜서 한 것과 스스로 한 것이 다른 신호로 남는다', () => {
  const list = [{ id: 'e1', npc: 'mom', text: '담요', kind: 'give',
    target: 'blanket', asked_at: '13:00', done_at: null }];
  assert.deepEqual(errands.whyOf(list, { kind: 'give', target: 'blanket' }),
    { why: 'errand', for: 'mom' });
  assert.deepEqual(errands.whyOf(list, { kind: 'give', target: 'onigiri' }),
    { why: 'self', for: null }, '안 시킨 것을 준 건 스스로 한 것이다');
});
