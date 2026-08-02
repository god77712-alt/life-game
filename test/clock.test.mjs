// DESIGN.md §1 "하루 길이 표"와 코드가 어긋나지 않는지.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Clock, fmt, wakeAfter, dayRealSeconds,
  DAY_END, DAY1_WAKE, MS_PER_GAME_MIN, AWAKE_SPAN,
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

test('자정은 하루를 끝내지 않는다 — 넘어가는 순간만 한 번 알린다', () => {
  const c = new Clock(H(23));            // 60 게임분 남음 = 30 실제초
  let hits = 0;
  for (let i = 0; i < 40; i++) hits += c.advance(1000) ? 1 : 0;
  assert.equal(hits, 1, '넘는 순간 딱 한 번');
  assert.ok(c.minutes > DAY_END, '시계는 멈추지 않고 계속 간다');
  assert.equal(c.running, true, '자정에 시계가 서면 안 된다');
  assert.equal(c.pastMidnight, true);
  assert.equal(c.label, '00:20');        // 23:00 + 40실제초(=80게임분) = 24:20 → 00:20
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

test('자정을 넘겨도 날짜는 그대로 — 하루는 잘 때만 넘어간다', () => {
  const c = new Clock(H(14));
  c.advance(11 * 60 * MS_PER_GAME_MIN);  // 25:00
  assert.equal(c.day, 1, '안 잤으면 아직 어제다');
  assert.equal(c.label, '01:00');
  assert.equal(c.pastMidnight, true);
});

test('자정을 넘겨 자도 기상 시각이 맞다', () => {
  const c = new Clock(H(14));
  c.nextDay(H(26));                      // 새벽 2시에 잤다 (26:00)
  assert.equal(c.label, '11:00', '02:00 + 9시간');
  assert.equal(c.day, 2);
});

test('취침 시각 제한이 없다 — 몇 시든 잘 수 있다', async () => {
  const m = await import('../src/game/clock.js');
  assert.equal(m.SLEEP_FROM, undefined, 'SLEEP_FROM은 걷어냈다');
  assert.equal(m.SLEEP_ANYTIME, true);
  // 기상 직후에 자면 하루가 짧아지지만 **막지 않는다.** 그건 플레이어의 선택이다
  assert.equal(wakeAfter(H(14)), H(23), '14:00 취침 → 23:00 기상');
});

test('progress는 깨어난 뒤 16시간을 한 칸으로 본다', () => {
  const c = new Clock(H(12));
  assert.equal(c.progress, 0);
  c.advance(8 * 60 * MS_PER_GAME_MIN);   // 8게임시간 = 절반
  assert.equal(Math.round(c.progress * 100) / 100, 0.5);
  c.advance(20 * 60 * MS_PER_GAME_MIN);  // 한참 넘겨도
  assert.equal(c.progress, 1, '넘치지 않는다');
  assert.equal(Math.round(c.awakeMinutes / 60), 28);
});
