// 그 공간에 원래 있는 사람들.
//
// 지키려는 것:
//   1. **같은 날 같은 자리면 같은 사람** — 맵을 나갔다 오는 것만으로 엄마가 생기면 안 된다
//   2. 시간대가 사람을 가른다 — 낮 공원엔 친구, 밤 공원엔 노숙자
//   3. **빈 거실을 만들지 않는다** — 엄마가 없으면 쪽지가 있다
//   4. 대사는 여기 없다 (있으면 7/31에 걷어낸 고정 NPC로 돌아간 것)

import test from 'node:test';
import assert from 'node:assert/strict';
import { residentsAt, isDaytime, timeBand } from '../src/game/residents.js';

const H = (h) => h * 60;
const names = (list) => list.map((r) => r.name).sort();

test('낮과 밤을 가른다 — 자정을 넘긴 시각도', () => {
  assert.equal(isDaytime(H(12)), true);
  assert.equal(isDaytime(H(3)), false);
  assert.equal(isDaytime(H(26)), false, '26:00 = 새벽 2시');
  assert.equal(isDaytime(H(30)), true, '30:00 = 아침 6시');
});

test('편의점에는 언제나 알바생이 있다', () => {
  for (const h of [2, 9, 15, 23, 26]) {
    assert.ok(names(residentsAt('store', H(h), 3)).includes('편의점 알바생'), `${h}시`);
  }
});

test('공원 — 낮에는 친구가 자주, 밤에는 거의 없다', () => {
  let dayHits = 0;
  let nightHits = 0;
  for (let d = 1; d <= 40; d++) {
    if (names(residentsAt('park', H(14), d)).includes('친구')) dayHits++;
    if (names(residentsAt('park', H(23), d)).includes('친구')) nightHits++;
  }
  assert.ok(dayHits > 25, `낮에 친구가 너무 없다 (${dayHits}/40)`);
  assert.ok(nightHits < 12, `밤에 친구가 너무 많다 (${nightHits}/40)`);
  assert.ok(dayHits > nightHits * 2, '낮이 확실히 더 많아야 한다');
});

test('공원 — 노숙자는 밤에만 나온다', () => {
  let day = 0;
  let night = 0;
  for (let d = 1; d <= 40; d++) {
    if (names(residentsAt('park', H(13), d)).includes('노숙자')) day++;
    if (names(residentsAt('park', H(1), d)).includes('노숙자')) night++;
  }
  assert.equal(day, 0, '낮에는 아예 없다');
  assert.ok(night > 10 && night < 35, `밤 확률이 이상하다 (${night}/40)`);
});

test('확률이 실제로 그 확률이다 — 해시가 편향되면 안 된다', () => {
  // FNV만 돌렸을 때 0.55짜리가 60일 중 22일밖에 안 나왔다.
  // 날짜 한 글자만 다른 짧은 문자열이라 비트가 안 섞인 탓 (residents.js roll)
  const nights = 200;
  let homeless = 0;
  let friendDay = 0;
  for (let d = 1; d <= nights; d++) {
    if (names(residentsAt('park', H(1), d)).includes('노숙자')) homeless++;
    if (names(residentsAt('park', H(14), d)).includes('친구')) friendDay++;
  }
  const rate = homeless / nights;
  assert.ok(rate > 0.45 && rate < 0.65, `노숙자 0.55여야 하는데 ${rate.toFixed(2)}`);
  const fr = friendDay / nights;
  assert.ok(fr > 0.65 && fr < 0.85, `낮 친구 0.75여야 하는데 ${fr.toFixed(2)}`);
});

test('거실 — 엄마가 없는 날에는 쪽지가 있다. 빈 거실은 없다', () => {
  let mom = 0;
  let note = 0;
  for (let d = 1; d <= 40; d++) {
    const here = names(residentsAt('living', H(19), d));
    assert.ok(here.length > 0, `DAY ${d} 거실이 비었다`);
    if (here.includes('엄마')) mom++;
    if (here.includes('엄마가 남긴 쪽지')) note++;
    assert.ok(!(here.includes('엄마') && here.includes('엄마가 남긴 쪽지')),
      '엄마가 있는데 쪽지도 있으면 안 된다');
  }
  assert.equal(mom + note, 40, '둘 중 하나는 항상 있다');
  assert.ok(mom > 0 && note > 0, '한쪽으로만 쏠렸다');
});

test('같은 날 같은 공간이면 몇 번을 물어도 같다', () => {
  // 맵을 나갔다 들어오는 것만으로 사람이 바뀌면 안 된다
  for (let d = 1; d <= 10; d++) {
    const a = names(residentsAt('park', H(15), d));
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(names(residentsAt('park', H(15), d)), a, `DAY ${d}`);
    }
  }
});

test('날이 바뀌면 달라질 수 있다', () => {
  const seen = new Set();
  for (let d = 1; d <= 20; d++) seen.add(names(residentsAt('living', H(19), d)).join(','));
  assert.ok(seen.size > 1, '매일 똑같으면 관측할 게 없다');
});

test('붙박이에게 **대사가 없다** — 말은 매번 AI가 쓴다', () => {
  for (const map of ['living', 'store', 'park']) {
    for (const r of residentsAt(map, H(14), 1).concat(residentsAt(map, H(2), 1))) {
      assert.equal(r.lines, undefined, `${r.name}에 대사가 박혀 있다`);
      assert.equal(r.choices, undefined, `${r.name}에 선택지가 박혀 있다`);
      assert.ok(r.detail, '다가갔을 때 띄울 첫 줄은 있어야 한다');
    }
  }
});

test('사람만 호감도를 갖는다 — 쪽지는 마음이 없다', () => {
  const living = residentsAt('living', H(19), 7);
  for (const r of living) {
    if (r.name === '엄마') assert.equal(r.npc, 'mom');
    if (r.name === '엄마가 남긴 쪽지') assert.equal(r.npc, null);
  }
});

test('부탁은 사람에게만 붙는다', () => {
  const all = ['living', 'store', 'park'].flatMap((m) =>
    residentsAt(m, H(14), 5).concat(residentsAt(m, H(23), 5)));
  for (const r of all) {
    if (r.request) assert.ok(r.npc, `${r.name}에 부탁이 붙었는데 사람이 아니다`);
  }
});

test('없는 공간은 빈 배열 — 내 방과 골목에는 붙박이가 없다', () => {
  assert.deepEqual(residentsAt('room', H(14), 1), []);
  assert.deepEqual(residentsAt('street', H(14), 1), []);
});

test('시간대 이름', () => {
  assert.equal(timeBand(H(8)), '아침');
  assert.equal(timeBand(H(14)), '낮');
  assert.equal(timeBand(H(20)), '저녁');
  assert.equal(timeBand(H(23)), '밤');
  assert.equal(timeBand(H(26)), '자정 넘은 새벽');
});
