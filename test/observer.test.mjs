// 안 한 것이 제대로 남는지. 이게 비면 analyst가 회피를 읽을 수 없다.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Observer } from '../src/game/observer.js';

const mk = () => {
  const o = new Observer();
  o.enterPlace('공원', '19:20', ['park:kid_1', 'park:umbrella_1', 'park:bench_1']);
  return o;
};

test('실제로 한 것은 engaged에 남는다', () => {
  const o = mk();
  o.look({ key: 'park:kid_1', name: '공원의 아이' }, 2000);
  o.act('park:kid_1', '공원의 아이', '19:25', 'talk');
  const s = o.summary();
  assert.equal(s.engaged.length, 1);
  assert.equal(s.engaged[0].what, '공원의 아이');
  assert.equal(s.engaged[0].gazed_sec, 2);
  assert.equal(s.passed.length, 0, '한 것은 지나친 게 아니다');
});

test('바라봤는데 안 한 것은 passed로 — 가장 무거운 신호', () => {
  const o = mk();
  o.look({ key: 'park:kid_1', name: '공원의 아이' }, 3400);
  o.look(null, 16);                       // 시선을 뗌
  const s = o.summary((k) => k);
  assert.equal(s.passed.length, 1);
  assert.equal(s.passed[0].gazed_sec, 3.4);
  assert.equal(s.engaged.length, 0);
});

test('스치듯 지나간 건 응시로 치지 않는다', () => {
  const o = mk();
  o.look({ key: 'park:kid_1', name: 'x' }, 300);
  o.look(null, 16);
  assert.equal(o.summary().passed.length, 0, '0.3초는 망설임이 아니다');
});

test('오래 본 순서로 정렬된다', () => {
  const o = mk();
  o.look({ key: 'a', name: 'A' }, 1000); o.look(null, 1);
  o.look({ key: 'b', name: 'B' }, 5000); o.look(null, 1);
  o.look({ key: 'c', name: 'C' }, 2000); o.look(null, 1);
  assert.deepEqual(o.summary((k) => k).passed.map((p) => p.what), ['b', 'c', 'a']);
});

test('같은 대상을 여러 번 봐도 누적된다', () => {
  const o = mk();
  o.look({ key: 'a', name: 'A' }, 1000); o.look(null, 1);
  o.look({ key: 'a', name: 'A' }, 1500); o.look(null, 1);
  assert.equal(o.summary((k) => k).passed[0].gazed_sec, 2.5);
});

test('같은 공간에 있었는데 다가가지도 않은 것은 unseen', () => {
  const o = mk();
  o.look({ key: 'park:kid_1', name: '아이' }, 2000);
  o.act('park:kid_1', '아이', '19:25', 'talk');
  const s = o.summary((k) => k);
  assert.deepEqual(s.unseen.map((u) => u.what).sort(), ['park:bench_1', 'park:umbrella_1']);
  assert.equal(s.unseen[0].place, '공원');
});

test('체류 시간이 남는다 — 짧게 들렀다 나온 곳이 보인다', () => {
  const o = mk();
  o.leavePlace('19:44', 24);
  const s = o.summary();
  assert.equal(s.places[0].place, '공원');
  assert.equal(s.places[0].minutes, 24);
  assert.equal(s.places[0].out, '19:44');
});

test('알림 지연이 곧 reaction 신호다', () => {
  const o = new Observer();
  o.notify('n1', '지훈', '14:30');
  o.notify('n2', '엄마', '18:00');
  o.open('n1', '21:10', 400);
  const s = o.summary();
  assert.equal(s.notifications[0].delay_min, 400, '6시간 40분 만에 열었다');
  assert.equal(s.notifications[1].opened_at, null, '엄마 것은 안 열었다');
  assert.equal(s.notifications[1].delay_min, null);
});

test('하루가 바뀌면 리셋된다', () => {
  const o = mk();
  o.look({ key: 'a', name: 'A' }, 2000);
  o.act('a', 'A', '10:00', 'clean');
  o.reset();
  const s = o.summary();
  assert.deepEqual([s.places.length, s.engaged.length, s.passed.length, s.unseen.length], [0, 0, 0, 0]);
});

test('아무것도 안 해도 터지지 않는다', () => {
  const s = new Observer().summary();
  assert.deepEqual(s.engaged, []);
  assert.deepEqual(s.places, []);
});
