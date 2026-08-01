import test from 'node:test';
import assert from 'node:assert/strict';

import { Schedule, parseAt } from '../src/game/schedule.js';

const ev = (id, at, kind = 'dialogue') => ({
  event: { id, at, kind, beat: `${id} 상황` },
  script: { lines: [{ speaker: '엄마', text: '밥 뒀다' }], choices: [{ id: 'c1', text: '고마워' }] },
});

test('시각 파싱', () => {
  assert.equal(parseAt('10:30'), 630);
  assert.equal(parseAt('9:05'), 545);
  assert.equal(parseAt('24:00'), 1440);
  for (const bad of ['', '10시 30분', '10:5', '99:00', '10:75', null, undefined]) {
    assert.equal(parseAt(bad), null, `${bad}는 거부되어야`);
  }
});

test('시각이 되면 꺼내고, 한 번만 꺼낸다', () => {
  const s = new Schedule([ev('a', '10:30'), ev('b', '19:00')]);
  assert.equal(s.due(600), null, '10:00엔 아직');
  assert.equal(s.due(630).id, 'a');
  s.markPlayed('a');
  assert.equal(s.due(700), null, '다음 건 아직');
  assert.equal(s.due(1140).id, 'b');
});

test('시각이 지나도 늦게라도 꺼낸다', () => {
  const s = new Schedule([ev('a', '10:30')]);
  assert.equal(s.due(1400).id, 'a', '늦었다고 버리지 않는다');
});

test('기상보다 이른 편성은 기상 직후로 당긴다', () => {
  const s = new Schedule([ev('a', '06:00')], 9 * 60);   // 09:00 기상
  assert.equal(s.items[0].at, 540);
  assert.equal(s.due(539), null);
  assert.equal(s.due(540).id, 'a');
});

test('대사가 없거나 시각이 깨진 편성은 조용히 버린다', () => {
  const s = new Schedule([
    ev('ok', '10:00'),
    { event: { id: 'noTime', at: '아침' }, script: { lines: [{ text: 'x' }] } },
    { event: { id: 'noLines', at: '11:00' }, script: { lines: [] } },
  ]);
  assert.deepEqual(s.items.map((i) => i.id), ['ok']);
});

test('이른 것부터 나온다', () => {
  const s = new Schedule([ev('late', '22:00'), ev('early', '08:00')]);
  assert.deepEqual(s.items.map((i) => i.id), ['early', 'late']);
});

test('재생된 것만 이력으로 넘긴다 — 반복 편성을 막는 입력', () => {
  const s = new Schedule([ev('a', '10:00'), ev('b', '20:00')]);
  s.markPlayed('a');
  const h = s.toHistory(3);
  assert.equal(h.length, 1);
  assert.deepEqual(h[0], { day: 3, kind: 'dialogue', beat: 'a 상황' });
  assert.equal(s.pending.length, 1);
});

test('빈 편성도 터지지 않는다', () => {
  const s = new Schedule();
  assert.equal(s.due(600), null);
  assert.deepEqual(s.toHistory(1), []);
});
