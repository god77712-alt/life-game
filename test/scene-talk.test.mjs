// **씬의 실제 메서드로** 플레이 중에 났던 버그를 재현한다.
//
// game/talk.js 단위 시험은 부품이 맞는지만 본다. 버그는 부품이 아니라
// 배선에서 났다 — 씬이 어느 변수를 읽고 어디에 쓰느냐. 그래서 여기서는
// RoomScene의 진짜 메서드를 그대로 불러서 확인한다.
//
// Phaser는 브라우저 전역이라 없다. 이 시험이 건드리는 메서드는 화면을
// 안 만지므로, Scene 껍데기만 세워두면 실제 코드가 그대로 돈다.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Phaser ??= { Scene: class { constructor() {} } };
const { RoomScene } = await import('../src/scenes/RoomScene.js');

/** 대화에 필요한 것만 세운 씬. 나머지는 이 시험이 안 건드린다 */
function scene({ open = true } = {}) {
  const s = Object.create(RoomScene.prototype);
  s.resetEnding();
  s.affinity = {};
  s.npcNames = new Map();
  s.props = [];
  s.dialogue = { open };
  s.persist = () => {};
  s.overlay = { popAffinity: (name, to) => s.popped.push([name, to]) };
  s.popped = [];
  return s;
}

const CAT = { key: 'park:prop:c', npc: 'cat_park', name: '공원 고양이' };
const ALLEY = { key: 'street:prop:a', npc: 'cat_alley', name: '골목 고양이' };
const MOM = { key: 'living:prop:a', npc: 'mom', name: '엄마' };

test('**고양이에게 말을 거는데 엄마와 하던 대화가 안 딸려온다**', () => {
  const s = scene();

  s.beginTalk(MOM);
  s.remember('엄마', '밥은 먹었니');
  s.remember('나', '이따 먹을게');
  assert.equal(s.chatLog.length, 2);

  // 공원으로 나가서 고양이에게 말을 건다
  s.beginTalk(CAT);
  assert.deepEqual(s.chatLog, [], 'npc-reply에 엄마 대사가 넘어가면 엄마가 답한다');

  // 엄마 쪽은 지워지지 않았다 — 다시 가면 이어진다
  s.beginTalk(MOM);
  assert.equal(s.chatLog.length, 2, '"다시 말 걸기"가 초면이 되면 안 된다');
});

test('**대화가 끝난 뒤에 한 일이 그 상대의 호감도로 안 간다**', () => {
  const s = scene();

  s.beginTalk(CAT);
  s.raiseAffinity(talkTarget(s), 'spoke');
  const afterTalk = s.affinity.cat_park;
  assert.ok(afterTalk > 0, '말하는 중에는 오른다');

  // 대화를 끝내고 편의점으로 간다
  s.endTalk();
  s.dialogue.open = false;
  s.raiseAffinity(talkTarget(s), 'spoke');   // 편의점에서 무엇을 하든
  assert.equal(s.affinity.cat_park, afterTalk, '사료를 샀다고 고양이 마음이 열리지는 않는다');
});

test('**두 마리는 따로 오른다** — 공원 고양이에게 준 밥이 골목 고양이에게 안 간다', () => {
  const s = scene();

  s.beginTalk(CAT);
  s.raiseAffinity(CAT, 'favor');
  assert.ok(s.affinity.cat_park > 0);
  assert.equal(s.affinity.cat_alley, undefined, '다른 개체는 안 움직인다');

  s.beginTalk(ALLEY);
  s.raiseAffinity(ALLEY, 'favor');
  assert.notEqual(s.affinity.cat_park, undefined);
  assert.notEqual(s.affinity.cat_alley, undefined);
});

test('엄마는 100 고정 — 말을 걸어도 안 움직이고, 이름은 그래도 남는다', () => {
  const s = scene();
  s.beginTalk(MOM);
  s.raiseAffinity(MOM, 'favor');
  assert.equal(s.npcNames.get('mom'), '엄마', '안 움직여도 이름은 알아야 상태창에 mom이 안 뜬다');
  assert.equal(s.popped.length, 0, '안 움직였는데 팝업이 뜨면 오른 것처럼 보인다');
});

test('폰으로 온 말에 답해도 그 사람에게 간다 — 앞에 프롭이 없어도', () => {
  const s = scene();
  s.beginTalk({ npc: 'friend', name: '지훈' }, 'phone');
  s.raiseAffinity(talkTarget(s), 'spoke');
  assert.ok(s.affinity.friend > 0);
});

test('진열대에 대고 한 말은 아무에게도 안 간다', () => {
  const s = scene();
  s.beginTalk({ key: 'store:shelf', npc: null, name: '진열대' });
  s.raiseAffinity(talkTarget(s), 'spoke');
  assert.deepEqual(s.affinity, {});
});

/** 씬이 speak()에서 쓰는 것과 같은 판단 */
function talkTarget(s) {
  return talkModule.creditedTo(s.talkingWith, s.dialogue.open);
}
const talkModule = await import('../src/game/talk.js');
