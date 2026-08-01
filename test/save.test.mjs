// 저장 / 이어하기.
//
// 10일짜리 게임이 새로고침에 날아가면 아무도 끝까지 못 간다.
// 그리고 **원문이 살아 넘어가야 한다** — 요약되면 말투가 사라지고 거울이 그 사람을 안 닮는다.

import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage는 브라우저 것이다. 최소 동작만 흉내낸다
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const { snapshot, save, load, clear, has, describe, exportCode, importCode } =
  await import('../src/game/save.js');

const fakeScene = (over = {}) => ({
  clock: { day: 7, minutes: 1140, wake: 480 },
  total: 865,
  custom: null,
  roomIndex: 0,
  survey: { gender: '남' },
  world: { age: 24 },
  cast: [{ name: '지훈' }],
  table: { hypotheses: [{ id: 'h3', desire: '고양이 밥', confidence: 0.77 }] },
  history: [],
  plan: null,
  goal: null,
  collapsed: false,
  collapseNext: false,
  collapsedOn: null,
  realityDone: false,
  mirrorTurn: 0,
  mirrorLog: [],
  sleptLastNight: true,
  observer: { told: [{ text: '나도 요즘 그래', self: true, to: '지훈' }] },
  ...over,
});

test('저장하고 그대로 불러온다', () => {
  clear();
  assert.equal(has(), false);
  save(fakeScene());
  const s = load();
  assert.equal(s.day, 7);
  assert.equal(s.total, 865);
  assert.equal(has(), true);
});

test('직접 친 원문이 그대로 넘어간다 — 요약하지 않는다', () => {
  clear();
  save(fakeScene());
  const s = load();
  assert.equal(s.told.length, 1);
  assert.equal(s.told[0].text, '나도 요즘 그래');
  assert.equal(s.told[0].to, '지훈', '누구에게 열었는지가 가설의 핵심이다');
});

test('엔딩 상태가 살아 넘어간다 — 빠지면 현실 인증이 안 뜬다', () => {
  clear();
  save(fakeScene({ collapsed: true, collapsedOn: 9, realityDone: false }));
  const s = load();
  assert.equal(s.collapsed, true);
  assert.equal(s.collapsedOn, 9);
});

test('방 사진은 저장하지 않는다 — 인식 결과만', () => {
  clear();
  save(fakeScene({ custom: { label: '내 방 (사진)', vision: { objects: [{ type: 'bed' }] } } }));
  const s = load();
  assert.equal(s.room.vision.objects[0].type, 'bed');
  assert.equal(JSON.stringify(s).includes('base64'), false);
  assert.equal(JSON.stringify(s).includes('image'), false);
});

test('이어하기 코드로 왕복한다 — 한글이 깨지지 않는다', () => {
  clear();
  save(fakeScene());
  const code = exportCode();
  clear();
  assert.equal(has(), false);

  const back = importCode(code);
  assert.equal(back.day, 7);
  assert.equal(back.told[0].text, '나도 요즘 그래');
});

test('깨진 코드는 기존 저장을 건드리지 않는다', () => {
  clear();
  save(fakeScene({ total: 111 }));
  for (const bad of ['', '아무거나', 'eyJ2Ijo5OTl9', null]) {
    assert.equal(importCode(bad), null, String(bad));
  }
  assert.equal(load().total, 111, '실패한 불러오기가 저장을 지웠다');
});

test('형식이 바뀌면 조용히 새 게임', () => {
  clear();
  localStorage.setItem('life-game/save/v1', JSON.stringify({ v: 99, day: 3 }));
  assert.equal(load(), null);
});

test('describe가 이어하기 화면 한 줄을 만든다', () => {
  clear();
  save(fakeScene());
  const d = describe();
  assert.equal(d.day, 7);
  assert.equal(d.total, 865);
  assert.equal(d.opened, 1);
  assert.ok(d.hypothesis.includes('고양이'));
});

test('snapshot은 스프라이트 같은 걸 담지 않는다', () => {
  const s = snapshot(fakeScene());
  const json = JSON.stringify(s);
  assert.ok(json.length < 20000, `저장이 ${json.length}자 — localStorage 한도를 위협한다`);
});
