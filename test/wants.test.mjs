// 흘린 말을 기억한다.
//
// 지키려는 것:
//   1. **합치는 자리가 하나다** — 정적 wants와 들은 것을 씬이 각자 펴면 안 된다
//   2. 코드가 감당 못 하는 것은 조용히 버린다 (못 파는 물건·동물·상대 없음)
//   3. **주면 잊는다** — 안 지우면 커피 하나로 호감도를 계속 긁을 수 있다
//   4. **초반에만, 드물게** — 아직 서먹한 사이만, 하루 한 명만.
//      프롬프트는 빈도를 못 지킨다. 여기서 막는다

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  noteWant, heardFrom, wantsOf, forget, isRemembered, summary, canDrop, PER_DAY,
} from '../src/game/wants.js';
import { ITEMS } from '../src/game/shop.js';
import { EARLY, START, PINNED } from '../src/game/affinity.js';

// 아직 서먹한 사이 — 흘릴 수 있는 구간
const NEW = START;

test('흘린 말이 적힌다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee', hint: '야간이라 커피를 달고 산다' }, 3, NEW);
  assert.equal(heardFrom(m, 'friend').item, 'coffee');
  assert.equal(heardFrom(m, 'friend').day, 3);
  assert.equal(heardFrom(m, 'clerk'), null, '안 흘린 사람에게 생기면 안 된다');
});

test('편의점에 없는 것은 버린다', () => {
  // 못 파는 걸 원하면 플레이어가 구할 방법이 없다 — 영영 안 닫히는 줄이 된다
  const m = noteWant({}, 'friend', { item: '위스키' }, 1, NEW);
  assert.deepEqual(m, {}, '재고에 없는 물건이 들어왔다');
  assert.ok(!ITEMS['위스키'], '테스트 전제가 깨졌다');
});

test('상대가 없으면 버린다 — 사물에는 마음이 없다', () => {
  assert.deepEqual(noteWant({}, null, { item: 'coffee' }, 1, NEW), {});
  assert.deepEqual(noteWant({}, 'friend', null, 1, NEW), {});
});

test('동물은 못 흘린다', () => {
  // 고양이는 말을 안 한다. 동물의 몫은 정적 wants가 이미 갖고 있다
  const m = noteWant({}, 'cat_park', { item: 'catfood' }, 1, NEW);
  assert.deepEqual(m, {}, '동물이 말을 했다');
});

// ── 초반에만, 드물게 ─────────────────────────────────────
//
// 사이를 트는 장치다. 아무 때나 나오면 편의점 심부름 게임이 된다.

test('**편해진 사람은 안 흘린다** — 물건으로 마음을 살 구간이 아니다', () => {
  assert.ok(canDrop({}, 'friend', EARLY - 1, 1), '아직 서먹하면 흘린다');
  assert.ok(!canDrop({}, 'friend', EARLY, 1), '편해지면 그만이다');
  assert.deepEqual(noteWant({}, 'friend', { item: 'coffee' }, 1, 80), {},
    '가까운 사이에 삼각김밥을 받는 건 어색하다 — 그 사이에서 오가는 건 말이다');
});

test('엄마는 안 흘린다 — 100 고정이라 저절로 걸린다', () => {
  assert.ok(!canDrop({}, 'mom', PINNED.mom, 1),
    '잘해서 얻는 자리가 아닌 사람이 하나는 있어야 한다');
});

test('**하루에 한 명만** — 여럿이 흘리면 장보기 목록이 된다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  assert.equal(PER_DAY, 1, '이 테스트는 하루 한 명을 전제한다');
  assert.deepEqual(noteWant(m, 'clerk', { item: 'onigiri' }, 1, NEW), m,
    '같은 날 두 번째가 들어왔다');
  // 날이 바뀌면 다시 열린다
  assert.equal(heardFrom(noteWant(m, 'clerk', { item: 'onigiri' }, 2, NEW), 'clerk').item, 'onigiri');
});

test('**안 준 게 있으면 새로 안 흘린다** — 놓친 것이 조용히 사라지면 안 된다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  const after = noteWant(m, 'friend', { item: 'onigiri' }, 5, NEW);
  assert.equal(heardFrom(after, 'friend').item, 'coffee', '덮어쓰면 못 준 커피가 없던 일이 된다');
  assert.equal(Object.keys(after).length, 1, '쌓였다 — 가방을 비우면 되는 게임이 된다');
});

test('주고 나면 다시 흘릴 수 있다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  const given = forget(m, 'friend', 'coffee');
  assert.equal(heardFrom(noteWant(given, 'friend', { item: 'onigiri' }, 4, NEW), 'friend').item,
    'onigiri', '한 번 주고 나면 관계가 이어질 수 있어야 한다');
});

test('사람이 다르면 따로 쌓인다 — 날이 다르면', () => {
  let m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  m = noteWant(m, 'clerk', { item: 'onigiri' }, 2, NEW);
  assert.equal(heardFrom(m, 'friend').item, 'coffee');
  assert.equal(heardFrom(m, 'clerk').item, 'onigiri');
});

test('정적 wants와 들은 것이 한 함수에서 합쳐진다', () => {
  const homeless = { npc: 'homeless', wants: ['blanket', 'onigiri'] };
  assert.deepEqual(wantsOf(homeless, {}), ['blanket', 'onigiri'], '아무 말도 안 들었으면 정적 그대로');

  const m = noteWant({}, 'homeless', { item: 'coffee' }, 1, NEW);
  // **들은 것이 앞에 온다** — wantedFrom이 먼저 맞는 하나를 집으므로,
  // 담요와 커피를 둘 다 들고 서면 들은 쪽이 나가야 한다
  assert.deepEqual(wantsOf(homeless, m), ['coffee', 'blanket', 'onigiri']);
});

test('wants가 문장이면 무시한다 — 거울 인물이 게임 루프를 죽이지 않게', () => {
  // 골 맵의 거울 인물은 `wants`에 아이템 id가 아니라 문장을 갖는다 (디렉터 프롬프트용).
  // 그대로 흘려보내면 wantedFrom이 문자열에 .find를 걸어 update가 매 프레임 터진다
  const mirror = { npc: null, wants: '자기 손으로 한 장 찍는 것.' };
  assert.deepEqual(wantsOf(mirror, {}), []);
  assert.deepEqual(wantsOf({ wants: null }, {}), []);
});

test('들은 것이 정적과 같으면 중복되지 않는다', () => {
  const homeless = { npc: 'homeless', wants: ['blanket', 'onigiri'] };
  const m = noteWant({}, 'homeless', { item: 'blanket' }, 1, NEW);
  assert.deepEqual(wantsOf(homeless, m), ['blanket', 'onigiri']);
});

test('아무것도 없는 상대는 빈 배열 — 주기가 안 열린다', () => {
  assert.deepEqual(wantsOf({ npc: 'clerk' }, {}), []);
  assert.deepEqual(wantsOf(null, {}), []);
});

test('주면 잊는다 — 정적은 안 건드린다', () => {
  const cat = { npc: 'cat_park', wants: ['catfood'] };
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);

  const after = forget(m, 'friend', 'coffee');
  assert.equal(heardFrom(after, 'friend'), null, '준 것을 계속 원한다 — 호감도를 긁을 수 있다');
  // 고양이는 내일도 배가 고프다
  assert.deepEqual(wantsOf(cat, after), ['catfood']);
});

test('다른 걸 줬으면 안 잊는다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  const after = forget(m, 'friend', 'onigiri');
  assert.equal(heardFrom(after, 'friend').item, 'coffee', '커피는 아직 안 줬다');
});

test('기억해서 준 것과 원래 알던 것을 구분한다', () => {
  const m = noteWant({}, 'friend', { item: 'coffee' }, 1, NEW);
  assert.ok(isRemembered(m, 'friend', 'coffee'));
  // 고양이에게 사료를 준 건 기억이 아니다 — 처음부터 알 수 있는 것이었다
  assert.ok(!isRemembered(m, 'cat_park', 'catfood'));
  assert.ok(!isRemembered(m, 'friend', 'onigiri'));
});

test('정산에는 아직 안 준 것만, 며칠 됐는지와 함께 실린다', () => {
  let m = noteWant({}, 'friend', { item: 'coffee', hint: '야간 근무' }, 2, NEW);
  m = noteWant(m, 'clerk', { item: 'onigiri' }, 5, NEW);
  const rows = summary(m, { friend: '지훈' }, 5);

  const friend = rows.find((r) => r.npc === 'friend');
  assert.equal(friend.who, '지훈', '이름이 안 붙으면 누구였는지 모른다');
  assert.equal(friend.label, ITEMS.coffee.label);
  assert.equal(friend.days_ago, 3, '사흘째 안 줬다는 게 신호다');
  assert.equal(rows.find((r) => r.npc === 'clerk').days_ago, 0);

  // 준 것은 여기서 사라진다 — engaged에 why:'remembered'로 남는다
  assert.equal(summary(forget(m, 'friend', 'coffee'), {}, 5).length, 1);
});

test('원본을 건드리지 않는다', () => {
  const m0 = {};
  const m1 = noteWant(m0, 'friend', { item: 'coffee' }, 1, NEW);
  assert.deepEqual(m0, {}, 'noteWant가 원본을 고쳤다');
  const m2 = forget(m1, 'friend', 'coffee');
  assert.equal(heardFrom(m1, 'friend').item, 'coffee', 'forget이 원본을 고쳤다');
  assert.deepEqual(m2, {});
});
