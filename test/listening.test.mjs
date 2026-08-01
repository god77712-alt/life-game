// 자기 개방 감지 — **이 게임의 최종 목표 달성 여부를 세는 코드다.**
// 여기가 틀리면 가설 검증 전체가 허공에 뜬다.
//
// 원칙: 놓치는 건 괜찮다 (analyst가 원문을 그대로 본다).
//       **없는 걸 만들어내지만 않으면 된다.**

import test from 'node:test';
import assert from 'node:assert/strict';

import { Attention, discloses, disclosures } from '../src/game/listening.js';

// ── 자기 개방 ───────────────────────────────────────────────

test('1인칭 + 상태가 같이 나오면 자기 얘기다', () => {
  for (const s of ['나도 요즘 그래', '저도 그런 적 있어요', '내가 좀 그런 편이라 힘들었어']) {
    assert.equal(discloses(s)?.self, true, s);
  }
});

test('묻는 말은 자기 개방이 아니다 — 상대에게 던진 것이다', () => {
  // 실제 시뮬레이션에서 이 사람이 친 문장들. 전부 묻는 쪽이었다
  for (const s of ['걔 이름 있어?', '밥은 누가 줘', '만져도 되나 그거']) {
    assert.equal(discloses(s)?.self, false, s);
  }
});

test('1인칭이 있어도 물음표로 끝나면 개방이 아니다', () => {
  assert.equal(discloses('저도 가도 돼요?')?.self, false);
});

test('표식이 하나뿐이면 자기 얘기로 안 센다', () => {
  // '힘들겠네요'는 남 얘기일 수 있다. 우연을 배제한다
  const d = discloses('힘들겠네요');
  assert.equal(d.self, false);
  assert.ok(d.marks.includes('상태 서술'));
});

test('빈 문장은 null', () => {
  for (const s of ['', '   ', null, undefined]) assert.equal(discloses(s), null);
});

test('평소보다 두 배 길면 표식이 붙는다 — 할 말이 있었다는 뜻', () => {
  const d = discloses('사실 그때부터 사람 만나는 게 좀 어려워져서 계속 미루고 있었어요', 8);
  assert.ok(d.marks.includes('평소보다 김'));
  assert.equal(d.self, true);
});

test('평소 길이는 중앙값이다 — 긴 문장 하나에 안 끌려간다', () => {
  const out = disclosures([
    { text: '응' }, { text: '그래' }, { text: '몰라' },
    { text: '아까 말한 거 있잖아 그거 사실 내가 예전에 해보려다 못 했던 거라서 좀 그랬어' },
  ]);
  assert.ok(out.baseline <= 5, `중앙값이 ${out.baseline} — 평균이면 20을 넘는다`);
});

test('하루치에서 자기 개방 건수를 센다', () => {
  const out = disclosures([
    { at: '16:31', text: '걔 이름 있어?', to: '지훈' },
    { at: '21:40', text: '나도 요즘 밖에 잘 안 나가', to: '지훈' },
    { at: '22:10', text: '응', to: '엄마' },
  ]);
  assert.equal(out.count, 1);
  assert.equal(out.lines.length, 3, '개방이 아닌 것도 원문은 남긴다');
  assert.equal(out.lines.find((l) => l.self).to, '지훈', '누구에게 열었는지가 가설의 핵심이다');
});

test('원문을 요약하거나 바꾸지 않는다', () => {
  const raw = '  나도 사실 좀 그랬어  ';
  assert.equal(discloses(raw).text, '나도 사실 좀 그랬어');
});

// ── 참여도 ──────────────────────────────────────────────────

test('한 줄도 안 건너뛰면 read = 1', () => {
  const a = new Attention('지훈');
  a.line(); a.line(); a.line();
  assert.equal(a.summary().read, 1);
});

test('전부 건너뛰면 read = 0 — 스킵 자체가 신호다', () => {
  const a = new Attention('엄마');
  for (let i = 0; i < 3; i++) { a.line(); a.skip(); }
  const s = a.summary();
  assert.equal(s.read, 0);
  assert.equal(s.speaker, '엄마');
});

test('↑↓를 한 번도 안 눌렀으면 moved = 0 (기본값을 그냥 눌렀다)', () => {
  const a = new Attention();
  a.line(); a.choicesShown(); a.chose();
  assert.equal(a.summary().moved, 0);
});

test('고르지 않고 닫은 것도 남는다', () => {
  const a = new Attention('엄마');
  a.line(); a.abandoned = true;
  assert.equal(a.summary().abandoned, true);
});

test('참여도는 판단하지 않는다 — 숫자만 낸다', () => {
  const s = new Attention('엄마').summary();
  for (const k of Object.keys(s)) {
    assert.ok(!/무성의|성의|나쁨|좋음|점수|score/.test(k), `해석이 섞인 필드: ${k}`);
  }
});
