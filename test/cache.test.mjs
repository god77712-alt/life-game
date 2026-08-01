// 개발 중 반복 호출이 실제 플레이보다 비싸다. 캐시가 제대로 맞고 제대로 무효화되는지.

import test from 'node:test';
import assert from 'node:assert/strict';

import { keyOf } from '../server/cache.mjs';

const base = ['director', 'claude-opus-5', 'high', '시스템 프롬프트', '유저 메시지', { type: 'object' }, null];

test('같은 입력은 같은 키', () => {
  assert.equal(keyOf(base), keyOf([...base]));
});

test('프롬프트를 한 글자만 고쳐도 키가 바뀐다 — 낡은 응답을 볼 일이 없다', () => {
  const edited = [...base];
  edited[3] = '시스템 프롬프트.';
  assert.notEqual(keyOf(base), keyOf(edited));
});

test('스키마가 바뀌면 키가 바뀐다', () => {
  const edited = [...base];
  edited[5] = { type: 'object', properties: { a: { type: 'string' } } };
  assert.notEqual(keyOf(base), keyOf(edited));
});

test('effort·모델·에이전트가 바뀌면 키가 바뀐다', () => {
  for (const i of [0, 1, 2]) {
    const edited = [...base];
    edited[i] = `${edited[i]}-다름`;
    assert.notEqual(keyOf(base), keyOf(edited), `index ${i}`);
  }
});

test('입력 데이터가 바뀌면 키가 바뀐다 — 날마다 다른 정산은 캐시를 안 탄다', () => {
  const day4 = [...base];
  day4[4] = 'DAY 4 정산';
  const day5 = [...base];
  day5[4] = 'DAY 5 정산';
  assert.notEqual(keyOf(day4), keyOf(day5));
});

test('키는 짧고 파일명으로 안전하다', () => {
  const k = keyOf(base);
  assert.match(k, /^[0-9a-f]{24}$/);
});
