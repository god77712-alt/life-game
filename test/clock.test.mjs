// DESIGN.md §1 "하루 길이 표"와 코드가 어긋나지 않는지.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Clock, fmt, wakeAfter, dayRealSeconds,
  DAY_END, DAY1_WAKE, MS_PER_GAME_MIN,
} from '../src/game/clock.js';

const H = (h) => h * 60;

test('환산율 — 1 실제초 = 2 게임분', () => {
  const c = new Clock(H(8));
  c.advance(1000);                       // 1 실제초
  assert.equal(Math.round(c.minutes - H(8)), 2);
  c.advance(30_000);                     // 30 실제초 = 1 게임시간
  assert.equal(Math.round(c.minutes - H(8)), 62);
});

test('DESIGN.md 하루 길이 표를 그대로 재현한다', () => {
  // 취침 → 기상 → 활동시간 → 실제 분
  const table = [
    [H(20), H(5), 19, 9.5],
    [H(21), H(6), 18, 9.0],
    [H(22), H(7), 17, 8.5],
    [H(23), H(8), 16, 8.0],   // 기준선
    [DAY_END, H(9), 15, 7.5], // 자정 강제 종료
  ];
  for (const [sleep, wake, activeHours, realMinutes] of table) {
    assert.equal(wakeAfter(sleep), wake, `${fmt(sleep)} 취침 → 기상 시각`);
    assert.equal((DAY_END - wake) / 60, activeHours, `활동 ${activeHours}시간`);
    assert.equal(dayRealSeconds(wake) / 60, realMinutes, `실제 ${realMinutes}분`);
  }
});

test('Day 1은 14:00 기상 · 실제 5분', () => {
  const c = new Clock();
  assert.equal(c.day, 1);
  assert.equal(c.label, '14:00');
  assert.equal(dayRealSeconds(DAY1_WAKE) / 60, 5);
});

test('자정에 도달하면 정확히 한 번 알린다', () => {
  const c = new Clock(H(23));            // 60 게임분 남음 = 30 실제초
  let hits = 0;
  for (let i = 0; i < 40; i++) hits += c.advance(1000) ? 1 : 0;
  assert.equal(hits, 1);
  assert.equal(c.minutes, DAY_END);
  assert.equal(c.running, false);
  assert.equal(c.label, '00:00');        // 24:00은 00:00으로 표시
});

test('멈춘 시계는 흐르지 않는다', () => {
  const c = new Clock(H(10));
  c.stop();
  c.advance(10_000);
  assert.equal(c.minutes, H(10));
});

test('취침 시각을 유지하면 활동 시간이 15시간으로 수렴한다', () => {
  // 오늘을 줄여 내일을 사는 재분배 — DESIGN.md §1 "설계 의도와 실제 동작"
  const c = new Clock(DAY1_WAKE);
  const sleepAt = H(23);
  const lengths = [];
  for (let d = 0; d < 4; d++) {
    lengths.push((DAY_END - c.wake) / 60);
    c.nextDay(sleepAt);
  }
  assert.deepEqual(lengths, [10, 16, 16, 16]);  // 첫날만 짧고 이후 수렴
  assert.equal(c.day, 5);
});

test('일찍 자면 그날은 짧고 다음 날이 길다', () => {
  const c = new Clock(H(8));             // 16시간짜리 하루
  c.nextDay(H(20));                      // 20:00 취침 (4시간 일찍)
  assert.equal(c.label, '05:00');
  assert.equal((DAY_END - c.wake) / 60, 19);  // 다음 날은 19시간
});

test('자정을 그냥 넘기면(안 잠) 00:00부터 하루가 통째로 남는다', () => {
  const c = new Clock(H(14));
  c.nextDay(null);                       // null = 안 잤음
  assert.equal(c.label, '00:00');
  assert.equal((DAY_END - c.wake) / 60, 24, '24시간');
  assert.equal(c.day, 2);
});

test('자면 짧아지고 안 자면 길다 — 취침은 시간을 쓴다', () => {
  const slept = new Clock(H(8));
  slept.nextDay(H(23));
  const awake = new Clock(H(8));
  awake.nextDay(null);
  assert.equal((DAY_END - slept.wake) / 60, 16);
  assert.equal((DAY_END - awake.wake) / 60, 24);
  assert.ok(awake.wake < slept.wake, '안 잔 쪽이 하루가 길다');
});

test('SLEEP_FROM 이전에는 잠들 수 없다 — 1시간짜리 하루 방지', async () => {
  const { SLEEP_FROM } = await import('../src/game/clock.js');
  assert.equal(SLEEP_FROM, 20 * 60);
  // 막지 않으면: 14:00 취침 → 23:00 기상 → 하루 1시간
  assert.equal((DAY_END - wakeAfter(H(14))) / 60, 1, '막아야 하는 이유');
  // 허용 구간에서는 항상 4시간 이상 남는다
  for (let m = SLEEP_FROM; m <= DAY_END; m += 30) {
    assert.ok((DAY_END - wakeAfter(m)) / 60 >= 15, `${fmt(m)} 취침 시 하루가 너무 짧다`);
  }
});

test('progress는 기상 0에서 자정 1로 간다', () => {
  const c = new Clock(H(12));
  assert.equal(c.progress, 0);
  c.advance(6 * 60 * MS_PER_GAME_MIN);   // 6게임시간 경과
  assert.equal(Math.round(c.progress * 100) / 100, 0.5);
});
