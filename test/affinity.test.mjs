// 호감도 — NPC가 플레이어에게 갖는 마음.
//
// 지키려는 것:
//   1. **엄마는 100 고정** — 오르지도 내리지도 않는다
//   2. 감점이 없다 — 안 만나면 안 오를 뿐
//   3. 자기 말을 직접 쓴 쪽이 선택지를 고른 것보다 크다

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialAffinity, affinityOf, raise, bandOf, affinityLines, GAIN, START, PINNED,
} from '../src/game/affinity.js';

test('엄마는 100에서 시작하고 100에서 끝난다', () => {
  let s = initialAffinity();
  assert.equal(affinityOf(s, 'mom'), 100);

  for (const kind of ['talk', 'spoke', 'favor']) {
    const r = raise(s, 'mom', kind);
    assert.equal(r.moved, false, `${kind}으로 엄마가 움직였다`);
    assert.equal(affinityOf(r.state, 'mom'), 100);
    s = r.state;
  }
});

test('저장에서 엄마 값이 깨져 와도 100으로 되돌린다', () => {
  const s = initialAffinity({ mom: 3, clerk: 40 });
  assert.equal(affinityOf(s, 'mom'), 100, '고정값은 저장보다 세다');
  assert.equal(affinityOf(s, 'clerk'), 40);
});

test('처음 만나는 사람은 시작값', () => {
  assert.equal(affinityOf({}, 'friend'), START);
  assert.equal(affinityOf(null, 'friend'), START);
  assert.equal(affinityOf({}, null), null);
});

test('대화하면 오르고, 자기 말을 쓰면 더 오른다', () => {
  const talk = raise(initialAffinity(), 'friend', 'talk');
  const spoke = raise(initialAffinity(), 'friend', 'spoke');
  assert.equal(talk.to, START + GAIN.talk);
  assert.equal(spoke.to, START + GAIN.spoke);
  assert.ok(spoke.to > talk.to, '남이 써준 말을 고르는 것과 자기 말을 만드는 것은 다르다');
});

test('부탁을 들어주면 대화보다 훨씬 크게 오른다', () => {
  const favor = raise(initialAffinity(), 'clerk', 'favor');
  assert.equal(favor.to, START + GAIN.favor);
  assert.ok(GAIN.favor > GAIN.spoke * 2);
});

test('100을 넘지 않는다', () => {
  let s = { friend: 96 };
  for (let i = 0; i < 10; i++) s = raise(s, 'friend', 'favor').state;
  assert.equal(affinityOf(s, 'friend'), 100);
});

test('모르는 종류로는 안 움직인다', () => {
  const r = raise(initialAffinity(), 'friend', '삐짐');
  assert.equal(r.moved, false);
});

test('내리는 길이 없다 — 감점 없음 (DESIGN.md §2)', () => {
  const values = Object.values(GAIN);
  assert.ok(values.every((v) => v > 0), '음수 이득이 있으면 그건 감점이다');
});

test('숫자만 보여주지 않는다 — 단계 이름이 붙는다', () => {
  assert.equal(bandOf(100), '가족');
  assert.equal(bandOf(75), '가깝다');
  assert.equal(bandOf(50), '편하다');
  assert.equal(bandOf(25), '아는 사이');
  assert.equal(bandOf(5), '서먹하다');
});

test('상태창 줄 — 높은 사람부터, 이름을 붙여서', () => {
  const s = { ...PINNED, friend: 30, clerk: 55 };
  const lines = affinityLines(s, { mom: '엄마', friend: '친구', clerk: '편의점 알바생' });
  assert.deepEqual(lines.map((l) => l.name), ['엄마', '편의점 알바생', '친구']);
  assert.equal(lines[0].value, 100);
  assert.equal(lines[0].band, '가족');
});

test('이름을 모르면 키라도 내보낸다 — 빈칸은 없다', () => {
  const [first] = affinityLines({ friend: 30 }, {});
  assert.equal(first.name, 'friend');
});
