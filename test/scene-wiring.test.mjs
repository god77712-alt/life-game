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
import * as save from '../src/game/save.js';

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

// ── 흘린 말이 편의점과 이어지는가 ────────────────────────
//
// 부품(wants.js)은 wants.test.mjs가 본다. 여기서 보는 건 **씬이 그걸 쓰는가**다 —
// 정적 wants만 보던 자리가 셋(행동 결정·건네기·관측)이라, 한 곳만 고치면
// "행동은 주기로 바뀌는데 줘도 기억한 걸로 안 세는" 상태가 된다.

function giver() {
  const s = scene();
  s.wants = {};
  s.bag = {};
  s.gaveTo = new Set();
  s.metProps = new Set();
  s.dialogueLog = [];
  s.observer = { acted: [], act(key, name, at, kind, why) { this.acted.push({ key, kind, why }); } };
  s.overlay.popNotice = () => {};
  s.placeLabel = () => '공원';
  s.refresh = () => {};
  s.approachProp = () => {};
  s.gx = 1; s.gy = 1; s.facing = 'down';       // 바로 아래 칸을 본다
  return s;
}

const FRIEND = { key: 'park:prop:a', npc: 'friend', name: '지훈', x: 1, y: 2 };

test('**흘린 말을 기억하면 행동이 `주기`로 바뀐다** — 정적 wants가 없는 사람인데도', () => {
  const s = giver();
  s.props = [FRIEND];

  // 아무 말도 안 들었으면 그냥 다가가기다. 커피를 들고 있어도 마찬가지
  s.bag = { coffee: 1 };
  assert.equal(s.currentTarget().action.verb, 'approach', '안 흘린 사람에게 주기가 열리면 안 된다');

  // 흘린 말을 들었다 → 손에 그게 있으므로 행동이 바뀐다
  s.noteWant('friend', { item: 'coffee', hint: '야간이라 커피를 달고 산다' });
  const t = s.currentTarget();
  assert.equal(t.action.verb, 'give');
  assert.equal(t.gift, 'coffee');
});

test('들었어도 손에 없으면 안 열린다 — 편의점에 가야 한다', () => {
  const s = giver();
  s.props = [FRIEND];
  s.noteWant('friend', { item: 'coffee' });
  assert.equal(s.currentTarget().action.verb, 'approach', '가방이 비었는데 주기가 열렸다');
});

test('**기억해서 준 것은 `remembered`로 남는다** — 시켜서 한 것과 다른 신호다', () => {
  const s = giver();
  s.props = [FRIEND];
  s.bag = { coffee: 1 };
  s.noteWant('friend', { item: 'coffee', hint: '야간 근무' });

  s.giveTo(FRIEND, 'coffee');
  assert.deepEqual(s.observer.acted.at(-1).why, { why: 'remembered', for: 'friend' },
    '아무도 안 시켰는데 준 것이 self로 남으면 관계 신호가 통째로 사라진다');
  assert.ok(s.dialogueLog.at(-1).remembered, '며칠 전 말이었는지가 정산에 남아야 한다');
});

test('시킨 사람이 있으면 부탁이 이긴다 — 순응과 기억이 섞이면 안 된다', () => {
  const s = giver();
  s.props = [FRIEND];
  s.bag = { coffee: 1 };
  s.errands = [{ id: 'e1', npc: 'mom', text: '지훈이 커피 좀', kind: 'give',
    target: 'coffee', asked_at: '13:00', done_at: null }];
  s.noteWant('friend', { item: 'coffee' });

  s.giveTo(FRIEND, 'coffee');
  assert.deepEqual(s.observer.acted.at(-1).why, { why: 'errand', for: 'mom' },
    '시켜서 한 것을 기억해서 한 것으로 세면 관계 신호가 부풀려진다');
});

test('원래 알던 것(고양이←사료)은 기억이 아니다', () => {
  const s = giver();
  const cat = { key: 'park:prop:c', npc: 'cat_park', name: '공원 고양이', x: 1, y: 2, wants: ['catfood'] };
  s.props = [cat];
  s.bag = { catfood: 1 };

  assert.equal(s.currentTarget().action.verb, 'give', '정적 wants는 그대로 열린다');
  s.giveTo(cat, 'catfood');
  assert.equal(s.observer.acted.at(-1).why.why, 'self',
    '처음부터 알 수 있는 것을 기억으로 세면 대화를 들은 것과 구분이 안 된다');
});

test('**주고 나면 잊는다** — 커피 하나로 호감도를 계속 긁을 수 없다', () => {
  const s = giver();
  s.props = [FRIEND];
  s.bag = { coffee: 2 };
  s.noteWant('friend', { item: 'coffee' });

  s.giveTo(FRIEND, 'coffee');
  assert.equal(s.wants.friend, undefined, '준 것을 계속 원하고 있다');
  s.gaveTo.clear();                            // 날이 바뀌어 다시 줄 수 있는 상태
  assert.equal(s.currentTarget().action.verb, 'approach', '내일도 같은 걸 원하면 자판기다');
});

test('흘린 말은 날짜를 넘어 남는다 — 어제 듣고 오늘 사 가는 게 전부다', () => {
  const s = giver();
  s.clock = { label: '14:00', day: 2 };
  s.noteWant('friend', { item: 'coffee' });
  assert.equal(s.wants.friend.day, 2, '들은 날이 안 남으면 며칠째인지 못 센다');

  const kept = save.snapshot({
    ...s, clock: { day: 2, minutes: 0, wake: 0 }, observer: { told: [] },
    npcNames: new Map(), custom: null,
  }).wants;
  assert.equal(kept.friend.item, 'coffee', '저장에서 빠지면 하루 안에 못 들으면 끝이다');
});
