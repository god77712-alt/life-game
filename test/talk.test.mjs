// 대화는 **하나의 사실이다.**
//
// 이 시험들은 전부 실제로 플레이 중에 나온 버그에서 왔다.
// 원인이 셋 다 같았다 — 같은 사실을 여러 변수가 나눠 들고 있었다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { open, logOf, remember, creditedTo, keyOf, MEMORY } from '../src/game/talk.js';
import { residentsAt, ROSTER, NPC_IDS, idOfName, isAnimal } from '../src/game/residents.js';

const CAT = { key: 'park:cat', npc: 'cat_park', name: '공원 고양이' };
const MOM = { key: 'living:mom', npc: 'mom', name: '엄마' };

test('**엄마와 하던 얘기가 고양이에게 안 넘어간다** — 실제로 났던 버그', () => {
  let chats = {};
  const withMom = open(MOM);
  chats = remember(chats, withMom, '엄마', '밥 먹었니');
  chats = remember(chats, withMom, '나', '이따 먹을게');

  const withCat = open(CAT);
  assert.deepEqual(logOf(chats, withCat), [], '고양이 서랍은 비어 있어야 한다');
  assert.equal(logOf(chats, withMom).length, 2, '엄마 쪽은 그대로 남는다');
});

test('같은 상대에게 다시 말을 걸면 아까 한 얘기를 기억한다', () => {
  let chats = remember({}, open(MOM), '엄마', '밥 먹었니');
  // 대화를 끊었다가 다시 다가간다 — 새 세션이지만 같은 사람이다
  assert.equal(logOf(chats, open(MOM)).length, 1, '"다시 말 걸기"가 초면이 되면 안 된다');
});

test('서랍 이름은 id로 짓는다 — 표시 이름은 바뀔 수 있다', () => {
  assert.equal(keyOf(open(CAT)), 'cat_park');
  assert.equal(keyOf(open({ name: '노숙자', npc: null })), '노숙자', 'id 없는 상대도 자기 서랍은 있다');
  assert.equal(keyOf(null), null);
});

test('이력은 무한정 늘지 않는다', () => {
  let chats = {};
  const s = open(MOM);
  for (let i = 0; i < MEMORY + 20; i++) chats = remember(chats, s, '나', `${i}`);
  assert.equal(logOf(chats, s).length, MEMORY);
  assert.equal(logOf(chats, s).at(-1).text, `${MEMORY + 19}`, '최근 것이 남는다');
});

test('빈 말은 안 쌓는다', () => {
  assert.deepEqual(remember({}, open(MOM), '나', ''), {});
  assert.deepEqual(remember({}, null, '나', '어'), {});
});

// ── 호감도가 엉뚱한 데로 가지 않는다 ─────────────────────

test('**대화창이 닫혀 있으면 아무에게도 호감도가 안 간다**', () => {
  const s = open(CAT);
  assert.deepEqual(creditedTo(s, true), { npc: 'cat_park', name: '공원 고양이' }, '말하는 중이면 그 상대에게');
  assert.equal(creditedTo(s, false), null, '창이 닫혔으면 아무에게도');
  assert.equal(creditedTo(null, true), null);
});

test('마지막으로 다가갔던 상대가 계속 남지 않는다 — 편의점에서 산 게 고양이에게 갔던 버그', () => {
  // 고양이와 얘기하고 끝냈다
  let now = open(CAT);
  now = null;                       // endTalk()
  // 그 뒤에 무슨 일이 있어도 고양이에게는 안 간다
  assert.equal(creditedTo(now, true), null);
});

test('폰으로 주고받은 것도 그 사람과 말한 것이다 — 프롭이 없어도 간다', () => {
  const byPhone = { npc: 'friend', name: '지훈', kind: 'phone', prop: null };
  assert.deepEqual(creditedTo(byPhone, true), { npc: 'friend', name: '지훈' });
});

test('사물에는 마음이 없다 — 진열대에 말해도 호감도가 안 생긴다', () => {
  const shelf = open({ key: 'store:shelf', npc: null, name: '진열대' });
  assert.equal(creditedTo(shelf, true), null);
});

// ── 두 마리는 두 마리다 ──────────────────────────────────

test('**공원 고양이와 골목 고양이는 다른 개체다** — 호감도가 같이 오르면 안 된다', () => {
  const park = residentsAt('park', 12 * 60, 3).find((r) => r.look === 'animal');
  const alley = residentsAt('street', 22 * 60, 3).find((r) => r.look === 'animal');
  // 그날 둘 다 나오는 날이 아닐 수도 있으니, 나온 날만 본다
  if (park && alley) assert.notEqual(park.npc, alley.npc);
  const ids = ROSTER.filter((r) => r.look === 'animal').map((r) => r.npc);
  assert.equal(new Set(ids).size, ids.length, '동물 id가 겹치면 한쪽에 준 밥이 양쪽에 간다');
});

test('명단은 한 곳에서만 나온다 — 사람을 나눌 때 한쪽을 놓치지 않게', () => {
  assert.equal(new Set(NPC_IDS).size, NPC_IDS.length, 'id가 겹치면 호감도 서랍이 섞인다');
  for (const r of ROSTER) {
    assert.equal(idOfName(r.name), r.npc, `${r.name} — 이름으로 못 찾으면 찾아온 사람을 못 알아본다`);
  }
  assert.equal(idOfName('없는 사람'), null);
});

test('동물인지 사람인지 명단이 답한다 — 씬이 이름으로 짐작하지 않게', () => {
  assert.ok(isAnimal('cat_park'));
  assert.ok(isAnimal('cat_alley'));
  assert.equal(isAnimal('mom'), false);
  assert.equal(isAnimal(null), false);
});
