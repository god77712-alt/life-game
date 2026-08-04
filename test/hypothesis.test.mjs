// confirmed 3조건은 상수다(CLAUDE.md). 코드가 판정하고, 그 판정이 흔들리지 않는지 고정한다.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  statusOf, applyStatus, missing, CONFIRM, openedBy,
  applyVerdicts, mergeAnalysis, MOVE, START_CONFIDENCE, AXES,
} from '../server/hypothesis.mjs';

const sig = (kind) => ({ day: 1, kind, evidence: 'x', reading: 'y' });

// 다섯 조건을 다 갖춘 가설. **who가 있고, 그 사람에게 실제로 자기 얘기를 했다.**
const full = {
  who: '지훈',
  confidence: 0.7,
  verified_count: 2,
  signals: ['language', 'reaction', 'behavior'].map(sig),
};
const OPENED = 1;   // statusOf의 두 번째 인자 — 그 상대에게 자기 얘기를 한 횟수

// 두 갈래. 같은 다섯 조건을 채웠지만 **자기 개방 요구가 다르다**
const want = { ...full, id: 'w', axis: 'want' };
const avoid = { ...full, id: 'v', axis: 'avoid' };

const told = (to = '지훈', n = 1) =>
  Array.from({ length: n }, () => ({ to, self: true, text: '나도 요즘 그래' }));

test('다섯 조건을 모두 만족해야 confirmed', () => {
  assert.equal(statusOf(full, OPENED), 'confirmed');
});

test('셋 중 하나라도 빠지면 confirmed가 아니다', () => {
  assert.notEqual(statusOf({ ...full, confidence: 0.69 }, OPENED), 'confirmed');
  assert.notEqual(statusOf({ ...full, verified_count: 1 }, OPENED), 'confirmed');
  assert.notEqual(statusOf({ ...full, signals: [sig('language'), sig('reaction')] }, OPENED), 'confirmed');
});

// ── 목표가 바뀌면서 생긴 두 조건 ────────────────────────────
// 예전에는 '고양이에게 밥 주기'(혼자 하는 일)가 confirmed를 가져갔다.
// 이 게임의 목표는 취향이 아니라 이 사람이 누군가에게 자기 얘기를 하는 것이다.

test('상대가 없으면 아무리 확실해도 confirmed가 아니다 — 혼자 하는 일은 답이 아니다', () => {
  assert.notEqual(statusOf({ ...full, who: 'none' }, 9), 'confirmed');
  assert.notEqual(statusOf({ ...full, who: undefined }, 9), 'confirmed');
});

test('그 상대에게 자기 얘기를 한 적이 없으면 confirmed가 아니다', () => {
  assert.notEqual(statusOf(full, 0), 'confirmed', '조건은 다 맞는데 실제로 열린 적이 없다');
  assert.equal(statusOf(full, 1), 'confirmed');
});

test('자기 얘기는 그 가설이 지목한 상대에게 한 것만 센다', () => {
  const out = applyStatus({ hypotheses: [full] }, told('엄마', 5));
  assert.notEqual(out.hypotheses[0].status, 'confirmed', '엄마에게 열었지 지훈에게 연 게 아니다');
  assert.equal(out.hypotheses[0].opened_to_who, 0);
});

test('openedBy는 상대별로 세고, 개방이 아닌 문장은 빼놓는다', () => {
  const m = openedBy([
    { to: '지훈', self: true }, { to: '지훈', self: true },
    { to: '지훈', self: false },
    { to: '엄마', self: true },
    { self: true },
  ]);
  assert.equal(m.get('지훈'), 2);
  assert.equal(m.get('엄마'), 1);
  assert.equal(m.size, 2);
});

test('신호 2겹이면 testing — Act 2 진입 조건', () => {
  assert.equal(statusOf({ confidence: 0.2, verified_count: 0, signals: [sig('language'), sig('behavior')] }), 'testing');
});

test('근거가 얕으면 forming', () => {
  assert.equal(statusOf({ confidence: 0.1, verified_count: 0, signals: [sig('language')] }), 'forming');
  assert.equal(statusOf({}), 'forming');
});

test('dropped가 모든 판정을 이긴다', () => {
  assert.equal(statusOf({ ...full, dropped: true }, OPENED), 'dropped');
});

test('Act은 날짜가 아니라 가설 상태에 종속된다', () => {
  assert.equal(applyStatus({ hypotheses: [] }).act, 1, '가설이 없으면 Act 1');
  // 셋 중 하나만 걸려도 testing → Act 2 (여기서는 confidence만 넘긴 경우)
  assert.equal(applyStatus({ hypotheses: [{ confidence: 0.75, verified_count: 0, signals: [] }] }).act, 2);
  assert.equal(applyStatus({ hypotheses: [{ confidence: 0.1, verified_count: 2, signals: [] }] }).act, 2);
  // **한 갈래만 차면 아직 Act 2다.** 무대(바람)에 그 사람(회피)이 서 있어야 골 맵이 성립한다
  assert.equal(applyStatus({ hypotheses: [want] }, told()).act, 2, '바람만 차면 아직');
  assert.equal(applyStatus({ hypotheses: [avoid] }, told()).act, 2, '회피만 차도 아직');
  assert.equal(applyStatus({ hypotheses: [avoid, want] }, told()).act, 3, '둘 다 차야 Act 3');
});

test('confirmed 가설을 찾아 넘긴다', () => {
  const out = applyStatus({ hypotheses: [{ id: 'a', signals: [] }, { ...avoid, id: 'b' }, { ...want, id: 'c' }] }, told());
  assert.equal(out.confirmed.id, 'c', '골 맵을 여는 것은 바람 쪽이다');
  assert.equal(out.confirmedAvoid.id, 'b');
  assert.equal(out.hypotheses[0].status, 'forming');
});

// ── 두 갈래 ─────────────────────────────────────────────────
//
// 알아내야 할 것이 둘이고, 각각이 만드는 것이 다르다.
//   avoid → 거울 인물이 그 회피를 갖는다   ·   want → 골 맵이 그 무대로 열린다

test('**갈래마다 따로 찬다** — 회피 둘이 확정돼도 골 맵은 안 열린다', () => {
  const out = applyStatus({ hypotheses: [{ ...avoid, id: 'a1' }, { ...avoid, id: 'a2' }] }, told());
  assert.ok(out.confirmedAvoid, '거울은 나온다');
  assert.equal(out.confirmedWant, null);
  assert.equal(out.confirmed, null, '무대가 없는데 골 맵을 열면 8/1의 그 실패로 돌아간다');
});

test('**회피는 자기 얘기를 안 해도 확정된다** — 안 한 것에서 읽히기 때문', () => {
  // 그 사람에게 한 번도 자기 얘기를 안 했다
  assert.equal(statusOf(avoid, 0), 'confirmed');
  assert.notEqual(statusOf(want, 0), 'confirmed', '바람은 말을 해봐야 안다');
  assert.equal(statusOf(want, 1), 'confirmed');
});

test('그래서 거울이 골 맵보다 먼저 열린다 — 응원할 시간이 생긴다', () => {
  assert.ok(AXES.avoid.needsOpening < AXES.want.needsOpening,
    '순서가 뒤집히면 거울 인물이 마지막에나 나온다');
});

test('회피에도 상대가 필요하다 — "사람이 무섭다"는 검증할 수 없다', () => {
  assert.notEqual(statusOf({ ...avoid, who: 'none' }, 0), 'confirmed');
});

test('갈래를 안 밝힌 옛 가설은 바람으로 읽는다 — 빡빡한 쪽이 안전하다', () => {
  const old = { ...want };
  delete old.axis;
  assert.notEqual(statusOf(old, 0), 'confirmed', '조건을 느슨하게 풀어주면 안 된다');
  assert.equal(applyStatus({ hypotheses: [old] }, told()).hypotheses[0].axis, 'want');
});

test('missing이 갈래에 맞는 것만 짚는다', () => {
  assert.deepEqual(missing({ ...avoid, opened_to_who: 0 }), [], '회피에 자기 얘기를 요구하면 순환이다');
  assert.ok(missing({ ...want, opened_to_who: 0 }).some((s) => s.includes('자기 얘기')));
});

test('missing은 부족한 조건만 정확히 짚는다', () => {
  assert.deepEqual(missing({ ...full, opened_to_who: 1 }), []);
  const m = missing({ who: '지훈', opened_to_who: 1, confidence: 0.3, verified_count: 0, signals: [sig('language')] });
  assert.equal(m.length, 3);
  assert.ok(m.some((s) => s.includes('0.30')));
  assert.ok(m.some((s) => s.includes('0/2')));
  assert.ok(m.some((s) => s.includes('reaction') && s.includes('behavior')));
});

test('missing이 상대 없음과 안 열림을 짚는다 — 디렉터가 무엇을 노릴지 여기서 안다', () => {
  const m = missing({ ...full, who: 'none', opened_to_who: 0 });
  assert.ok(m.some((x) => x.includes('상대가 없다')), m.join(' / '));
  assert.ok(m.some((x) => x.includes('자기 얘기')), m.join(' / '));
});

test('상수가 CLAUDE.md와 같다', () => {
  assert.equal(CONFIRM.confidence, 0.7);
  assert.equal(CONFIRM.verifications, 2);
  assert.deepEqual(CONFIRM.layers, ['language', 'reaction', 'behavior']);
});

// ── 판정 → 점수 이동 ────────────────────────────────────────
// 이 규칙이 흔들리면 confirmed가 의미를 잃는다. 코드가 유일한 출처임을 여기서 고정한다.

const h = (over = {}) => ({ id: 'h1', statement: 's', confidence: 0.4, verified_count: 1, signals: [], ...over });

test('supported는 confidence를 올리고 검증을 1 센다', () => {
  const [out] = applyVerdicts([h()], [{ id: 'h1', verdict: 'supported', evidence: 'e', note: 'n' }], 3);
  assert.equal(out.confidence, 0.5);
  assert.equal(out.verified_count, 2);
});

test('contradicted는 지지보다 크게 내리고 검증은 안 올린다', () => {
  const [out] = applyVerdicts([h()], [{ id: 'h1', verdict: 'contradicted', evidence: 'e', note: 'n' }], 3);
  assert.equal(out.confidence, 0.25);
  assert.equal(out.verified_count, 1);
  assert.ok(Math.abs(MOVE.contradicted) > MOVE.supported, '반박이 지지보다 무거워야 한다');
});

test('no_data는 아무것도 안 움직인다 — 증거의 부재는 부재의 증거가 아니다', () => {
  const [out] = applyVerdicts([h()], [{ id: 'h1', verdict: 'no_data', evidence: '', note: 'n' }], 3);
  assert.equal(out.confidence, 0.4);
  assert.equal(out.verified_count, 1);
});

test('판정이 없는 가설은 손대지 않는다', () => {
  const [out] = applyVerdicts([h()], [{ id: 'other', verdict: 'supported' }], 3);
  assert.equal(out.confidence, 0.4);
  assert.equal(out.verdicts, undefined);
});

test('confidence는 0~1을 벗어나지 않는다', () => {
  const [hi] = applyVerdicts([h({ confidence: 0.97 })], [{ id: 'h1', verdict: 'supported' }], 1);
  const [lo] = applyVerdicts([h({ confidence: 0.05 })], [{ id: 'h1', verdict: 'contradicted' }], 1);
  assert.equal(hi.confidence, 1);
  assert.equal(lo.confidence, 0);
});

test('판정 이력이 쌓이고 8건까지만 남는다', () => {
  let list = [h()];
  for (let d = 1; d <= 10; d++) list = applyVerdicts(list, [{ id: 'h1', verdict: 'no_data' }], d);
  assert.equal(list[0].verdicts.length, 8);
  assert.equal(list[0].verdicts.at(-1).day, 10);
});

test('analyst가 보낸 점수는 무시된다 — 채점 결과만 남는다', () => {
  const judged = [h({ confidence: 0.55, verified_count: 3 })];
  // 모델이 제멋대로 0.95를 실어 보내도
  const proposed = [{ id: 'h1', desire: 'd', statement: '좁혀진 문장', confidence: 0.95, verified_count: 9, signals: [], dropped: false }];
  const [out] = mergeAnalysis(judged, proposed);
  assert.equal(out.confidence, 0.55);
  assert.equal(out.verified_count, 3);
  assert.equal(out.statement, '좁혀진 문장', '문장은 analyst 것을 쓴다');
});

test('새 가설은 시작값에서 출발한다', () => {
  const [out] = mergeAnalysis([], [{ id: 'h9', desire: 'd', statement: 's', signals: [], dropped: false }]);
  assert.equal(out.confidence, START_CONFIDENCE);
  assert.equal(out.verified_count, 0);
});

test('supported만으로는 confirmed가 안 된다 — 3겹이 있어야 한다', () => {
  // 0.4에서 세 번 지지되면 0.7, 검증 4회. 그래도 신호가 한 겹뿐이면 testing이다
  let list = [h({ who: '지훈', signals: [{ kind: 'behavior' }] })];
  for (let d = 1; d <= 3; d++) list = applyVerdicts(list, [{ id: 'h1', verdict: 'supported' }], d);
  assert.equal(list[0].confidence, 0.7);
  assert.equal(statusOf(list[0], OPENED), 'testing');
});

test('신호는 쌓인다 — 오늘 안 나온 겹이 사라지면 confirmed가 풀린다', () => {
  const judged = [{
    id: 'h1', confidence: 0.8, verified_count: 3,
    signals: [{ kind: 'behavior', evidence: 'b1' }, { kind: 'reaction', evidence: 'r1' }],
  }];
  // analyst는 오늘 본 language 하나만 다시 써 보낸다
  const proposed = [{ id: 'h1', who: '지훈', label: 'l', statement: 's', dropped: false, signals: [{ kind: 'language', evidence: 'l1' }] }];
  const [out] = mergeAnalysis(judged, proposed);

  const kinds = new Set(out.signals.map((s) => s.kind));
  assert.equal(kinds.size, 3, '어제 겹이 살아 있어야 한다');
  assert.equal(statusOf(out, OPENED), 'confirmed');
});

test('같은 근거는 두 번 쌓이지 않는다', () => {
  const judged = [{ id: 'h1', confidence: 0.5, verified_count: 1, signals: [{ kind: 'behavior', evidence: 'b1' }] }];
  const proposed = [{ id: 'h1', desire: 'd', statement: 's', dropped: false, signals: [{ kind: 'behavior', evidence: 'b1' }] }];
  const [out] = mergeAnalysis(judged, proposed);
  assert.equal(out.signals.length, 1);
});
