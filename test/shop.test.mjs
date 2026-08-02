// 포인트로 사는 것들.
//
// 지키려는 것:
//   1. **빚이 생기지 않는다** — 모자라면 아무 일도 안 일어난다
//   2. 가진 것보다 많이 줄 수 없다
//   3. 점수는 여기 없다 — 이 파일은 포인트만 만진다 (누적 점수는 안 깎인다)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS, ORDER, buy, take, has, bagList, wantedFrom, bagLine, canAfford, itemLabel,
} from '../src/game/shop.js';

test('모든 물건에 이름과 값이 있다', () => {
  for (const id of ORDER) {
    assert.ok(ITEMS[id], `${id}가 ORDER에만 있고 ITEMS에 없다`);
    assert.ok(ITEMS[id].label);
    assert.ok(ITEMS[id].price > 0);
  }
  assert.equal(Object.keys(ITEMS).length, ORDER.length, 'ITEMS와 ORDER가 어긋났다');
});

test('사면 포인트가 줄고 가방에 들어온다', () => {
  const r = buy(100, {}, 'onigiri');
  assert.equal(r.ok, true);
  assert.equal(r.points, 100 - ITEMS.onigiri.price);
  assert.equal(r.bag.onigiri, 1);
});

test('같은 걸 또 사면 쌓인다', () => {
  let s = { points: 200, bag: {} };
  for (let i = 0; i < 3; i++) s = buy(s.points, s.bag, 'coffee');
  assert.equal(s.bag.coffee, 3);
  assert.equal(s.points, 200 - ITEMS.coffee.price * 3);
});

test('모자라면 아무 일도 안 일어난다 — 빚이 없다', () => {
  const r = buy(5, {}, 'blanket');
  assert.equal(r.ok, false);
  assert.equal(r.points, 5, '포인트가 줄면 안 된다');
  assert.deepEqual(r.bag, {}, '가방이 바뀌면 안 된다');
  assert.ok(r.reason);
});

test('없는 물건은 못 산다', () => {
  const r = buy(1000, {}, '자동차');
  assert.equal(r.ok, false);
  assert.equal(r.points, 1000);
});

test('canAfford가 buy와 같은 답을 한다', () => {
  for (const id of ORDER) {
    const p = ITEMS[id].price;
    assert.equal(canAfford(p, id), true);
    assert.equal(canAfford(p - 1, id), false);
    assert.equal(buy(p - 1, {}, id).ok, false);
  }
});

test('주면 가방에서 빠진다. 마지막 하나면 키가 사라진다', () => {
  const two = take({ catfood: 2 }, 'catfood');
  assert.equal(two.bag.catfood, 1);
  const one = take(two.bag, 'catfood');
  assert.equal('catfood' in one.bag, false, '0개가 남으면 안 된다');
});

test('없는 걸 주려 하면 실패하고 가방은 그대로', () => {
  const bag = { onigiri: 1 };
  const r = take(bag, 'blanket');
  assert.equal(r.ok, false);
  assert.deepEqual(r.bag, bag);
});

test('원하는 걸 가졌는지 — 없으면 null', () => {
  assert.equal(wantedFrom({ catfood: 1 }, ['catfood']), 'catfood');
  assert.equal(wantedFrom({}, ['catfood']), null);
  // 여러 개를 원하면 가진 것 중 앞에 적힌 것부터
  assert.equal(wantedFrom({ onigiri: 1 }, ['blanket', 'onigiri']), 'onigiri');
  assert.equal(wantedFrom({ blanket: 1, onigiri: 1 }, ['blanket', 'onigiri']), 'blanket');
});

test('가방 목록은 순서가 고정이다 — 살 때마다 줄이 튀면 안 된다', () => {
  const a = bagList({ blanket: 1, onigiri: 1 }).map((i) => i.id);
  const b = bagList({ onigiri: 1, blanket: 1 }).map((i) => i.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ORDER.filter((id) => a.includes(id)));
});

test('빈 가방도 한 줄은 나온다', () => {
  assert.equal(bagLine({}), '가진 것 없음');
  assert.equal(has({}, 'onigiri'), false);
  assert.match(bagLine({ onigiri: 2 }), /삼각김밥×2/);
});

test('먹을 수 있는 것과 줄 것이 갈린다', () => {
  assert.ok(ITEMS.onigiri.eat, '삼각김밥은 먹을 수 있어야 한다');
  assert.equal(ITEMS.catfood.eat, undefined, '사료를 플레이어가 먹으면 안 된다');
  assert.equal(ITEMS.blanket.eat, undefined);
});

test('이름을 모르는 id도 빈칸을 내지 않는다', () => {
  assert.equal(itemLabel('onigiri'), '삼각김밥');
  assert.equal(itemLabel('없는것'), '없는것');
});
