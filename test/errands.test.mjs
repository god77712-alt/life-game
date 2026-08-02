// 부탁 — 디렉터가 만들고, 안 한 것이 자료가 된다.
//
// 여기서 지키려는 것은 오염 방지 셋이다:
//   1. 코드가 확인할 수 없는 부탁은 안 받는다 (판정 못 하면 지어내게 된다)
//   2. **듣지 않은 부탁은 안 닫힌다** (우연히 한 것을 관계 신호로 세면 부풀려진다)
//   3. 안 한 것이 요약에 남는다 (빠지면 이 파일을 만든 이유가 없다)

import test from 'node:test';
import assert from 'node:assert/strict';
import { accept, ask, complete, openOf, whyOf, summary, KINDS } from '../src/game/errands.js';

const MAPS = ['living', 'street', 'store', 'park'];
const NPCS = ['mom', 'clerk', 'friend', 'homeless', 'cat'];
const take = (raw) => accept(raw, MAPS, NPCS);

const mom = { npc: 'mom', text: '빨래 좀 내놔라', kind: 'clean', target: 'laundry_basket', why: '쌓였다' };
const friend = { npc: 'friend', text: '편의점 좀 다녀와', kind: 'visit', target: 'store', why: '심심하다' };

test('제대로 된 부탁은 통과한다', () => {
  const out = take([mom]);
  assert.equal(out.length, 1);
  assert.equal(out[0].npc, 'mom');
  assert.equal(out[0].done_at, null);
  assert.equal(out[0].asked_at, null, '만나기 전에는 들은 게 아니다');
});

test('코드가 확인할 수 없는 부탁은 버린다', () => {
  assert.equal(take([{ ...mom, kind: '기분풀어주기' }]).length, 0, '모르는 kind');
  assert.equal(take([{ ...mom, target: '없는물건' }]).length, 0, '모르는 target');
  assert.equal(take([{ ...friend, target: '달나라' }]).length, 0, '없는 맵');
  assert.equal(take([{ ...mom, npc: '지나가는사람' }]).length, 0, '없는 사람');
  assert.equal(take([{ ...mom, text: '' }]).length, 0, '문장이 없다');
});

test('아무도 부탁하지 않는 날이 있어야 한다', () => {
  assert.deepEqual(take([]), []);
  assert.deepEqual(take(null), []);
});

test('한 사람이 하루에 하나. 하루 셋까지', () => {
  const two = take([mom, { ...mom, text: '이것도' }]);
  assert.equal(two.length, 1, '엄마가 하루에 두 번 시키면 안 된다');

  const many = take(NPCS.map((npc) => ({ ...mom, npc })));
  assert.equal(many.length, 3, '넷 이상이면 심부름 목록이 된다');
});

test('**듣지 않은 부탁은 안 닫힌다** — 우연히 한 것은 안 센다', () => {
  const list = take([mom]);
  const r = complete(list, { kind: 'clean', target: 'laundry_basket' }, '14:00');
  assert.equal(r.closed.length, 0, '만나지도 않았는데 완료되면 관계 신호가 부풀려진다');
  assert.equal(r.errands[0].done_at, null);
});

test('듣고 나서 하면 닫힌다', () => {
  let list = take([mom]);
  list = ask(list, 'mom', '13:00');
  assert.equal(openOf(list, 'mom').length, 1);

  const r = complete(list, { kind: 'clean', target: 'laundry_basket' }, '14:00');
  assert.equal(r.closed.length, 1);
  assert.equal(r.errands[0].done_at, '14:00');
  assert.equal(openOf(r.errands, 'mom').length, 0);
});

test('다른 행동으로는 안 닫힌다', () => {
  const list = ask(take([mom]), 'mom', '13:00');
  assert.equal(complete(list, { kind: 'clean', target: 'trash_pile' }, '14:00').closed.length, 0);
  assert.equal(complete(list, { kind: 'look', target: 'laundry_basket' }, '14:00').closed.length, 0);
});

test('두 번 해도 한 번만 닫힌다', () => {
  let list = ask(take([mom]), 'mom', '13:00');
  const a = complete(list, { kind: 'clean', target: 'laundry_basket' }, '14:00');
  const b = complete(a.errands, { kind: 'clean', target: 'laundry_basket' }, '15:00');
  assert.equal(b.closed.length, 0);
  assert.equal(b.errands[0].done_at, '14:00', '처음 한 시각이 남아야 한다');
});

test('행동의 이유가 붙는다 — 스스로 한 것과 시켜서 한 것', () => {
  const list = ask(take([mom]), 'mom', '13:00');
  assert.deepEqual(whyOf(list, { kind: 'clean', target: 'laundry_basket' }), { why: 'errand', for: 'mom' });
  assert.deepEqual(whyOf(list, { kind: 'clean', target: 'trash_pile' }), { why: 'self', for: null });
  // 안 들은 부탁은 이유가 되지 않는다
  assert.equal(whyOf(take([mom]), { kind: 'clean', target: 'laundry_basket' }).why, 'self');
});

test('요약에 **안 한 것**이 남는다 — 여기가 빠지면 이 체계가 무의미하다', () => {
  let list = take([mom, friend]);
  list = ask(list, 'mom', '13:00');                       // 엄마 것만 들었다
  list = complete(list, { kind: 'clean', target: 'laundry_basket' }, '14:00').errands;

  const s = summary(list);
  assert.equal(s.length, 2, '안 한 것이 사라지면 안 된다');

  const m = s.find((e) => e.npc === 'mom');
  assert.equal(m.heard, true);
  assert.equal(m.done, true);

  const f = s.find((e) => e.npc === 'friend');
  assert.equal(f.heard, false, '다가가지도 않았다');
  assert.equal(f.done, false);
  assert.ok(f.text, '무슨 부탁이었는지가 남아야 판단할 수 있다');
});

test('듣고도 안 한 것이 구분된다 — 가장 무거운 줄', () => {
  const list = ask(take([mom]), 'mom', '13:00');
  const [s] = summary(list);
  assert.equal(s.heard, true);
  assert.equal(s.done, false);
});

test('네 가지 종류 전부 판정할 수 있다', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), ['clean', 'give', 'look', 'visit']);
  const cases = [
    [{ npc: 'mom', text: 'a', kind: 'clean', target: 'trash_pile' }, { kind: 'clean', target: 'trash_pile' }],
    [{ npc: 'clerk', text: 'b', kind: 'look', target: 'shelf' }, { kind: 'look', target: 'shelf' }],
    [{ npc: 'friend', text: 'c', kind: 'visit', target: 'park' }, { kind: 'visit', target: 'park' }],
    [{ npc: 'cat', text: 'd', kind: 'give', target: 'catfood' }, { kind: 'give', target: 'catfood' }],
  ];
  for (const [raw, action] of cases) {
    const list = ask(take([raw]), raw.npc, '10:00');
    assert.equal(complete(list, action, '11:00').closed.length, 1, `${raw.kind} 판정 실패`);
  }
});

test('보상 필드가 아예 없다 — 대가를 걸 자리를 만들지 않는다', () => {
  const [e] = take([mom]);
  for (const k of ['reward', 'points', 'score', 'prize']) {
    assert.equal(k in e, false, `${k}가 있으면 신호가 오염된다`);
  }
});
