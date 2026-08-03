// 대화가 세상을 바꾼다 — 다만 **코드가 지킬 수 있는 약속만.**
//
// 지키려는 것:
//   1. 모델이 지어낸 약속을 게임이 못 지키면 그게 더 나쁘다 → 못 알아먹는 건 버린다
//   2. 곧바로 일어나지 않는다 → 말하자마자 생기면 마술이 된다
//   3. 없는 걸 만들지 않는다 → 있는 오브젝트·있는 인물·있는 공간만

import test from 'node:test';
import assert from 'node:assert/strict';
import { accept, due, line, KINDS, DELAY_MIN } from '../src/game/effects.js';

const CTX = { maps: ['room', 'living', 'street', 'store', 'park'], npcs: ['mom', 'friend', 'cat'], at: 600 };

test('밥상을 방에 놓아준다 — 이 게임에서 하고 싶었던 그 장면', () => {
  const e = accept({ kind: 'place', what: 'table', map: 'room', note: '이따 문 앞에 놓을게' }, CTX);
  assert.ok(e);
  assert.equal(e.kind, 'place');
  assert.equal(e.map, 'room');
  assert.equal(e.note, '이따 문 앞에 놓을게');
});

test('**곧바로 일어나지 않는다** — 말하자마자 생기면 마술이다', () => {
  const e = accept({ kind: 'give', item: 'onigiri', note: '이거 가져가' }, CTX);
  assert.equal(e.at, CTX.at + DELAY_MIN);
  assert.ok(DELAY_MIN > 0, '지연이 0이면 약속이 아니라 즉시 실행이다');
});

test('코드가 못 알아먹는 약속은 버린다', () => {
  assert.equal(accept({ kind: '기분좋게해주기' }, CTX), null, '실행할 방법이 없는 것');
  assert.equal(accept({ kind: 'place', what: '우주선', map: 'room' }, CTX), null, '없는 오브젝트');
  assert.equal(accept({ kind: 'place', what: 'table', map: '달나라' }, CTX), null, '없는 공간');
  assert.equal(accept({ kind: 'move', who: '유령', map: 'park' }, CTX), null, '없는 인물');
  assert.equal(accept({ kind: 'give', item: '자동차' }, CTX), null, '없는 물건');
  assert.equal(accept(null, CTX), null);
  assert.equal(accept({ kind: 'none' }, CTX), null, '아무 일도 안 일어나는 게 기본이다');
});

test('세 종류만 있다 — 늘리려면 코드가 먼저 할 줄 알아야 한다', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), ['give', 'move', 'place']);
});

test('사람을 옮길 수 있다 — "이따 공원에 있을게"', () => {
  const e = accept({ kind: 'move', who: 'friend', map: 'park', note: '이따 공원에 있을게' }, CTX);
  assert.equal(e.who, 'friend');
  assert.equal(e.map, 'park');
});

test('시각이 된 것만 일어난다. 나머지는 남는다', () => {
  const pending = [
    { kind: 'give', item: 'onigiri', at: 610 },
    { kind: 'place', what: 'table', map: 'room', at: 700 },
  ];
  const a = due(pending, 605);
  assert.equal(a.ready.length, 0, '아직 아무것도');
  assert.equal(a.rest.length, 2);

  const b = due(pending, 650);
  assert.equal(b.ready.length, 1);
  assert.equal(b.rest.length, 1, '아직 안 된 건 남는다');

  const c = due(pending, 9999);
  assert.equal(c.ready.length, 2);
  assert.equal(c.rest.length, 0);
});

test('빈 목록도 터지지 않는다', () => {
  assert.deepEqual(due([], 100), { ready: [], rest: [] });
  assert.deepEqual(due(null, 100), { ready: [], rest: [] });
});

test('무슨 약속이었는지가 화면에 남는다 — 없어도 빈칸은 아니다', () => {
  assert.equal(line({ kind: 'place', note: '문 앞에 놨어' }), '문 앞에 놨어');
  assert.ok(line({ kind: 'place' }).length > 0);
  assert.ok(line({ kind: 'move' }).length > 0);
  assert.ok(line({ kind: 'give' }).length > 0);
});

test('약속 문장은 길어도 잘린다 — 상자를 뚫지 않게', () => {
  const e = accept({ kind: 'give', item: 'coffee', note: '아'.repeat(200) }, CTX);
  assert.ok(e.note.length <= 60);
});
