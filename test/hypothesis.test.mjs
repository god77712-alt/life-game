// confirmed 3조건은 상수다(CLAUDE.md). 코드가 판정하고, 그 판정이 흔들리지 않는지 고정한다.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  statusOf, applyStatus, missing, CONFIRM,
  applyVerdicts, mergeAnalysis, MOVE, START_CONFIDENCE,
} from '../server/hypothesis.mjs';

const sig = (kind) => ({ day: 1, kind, evidence: 'x', reading: 'y' });
const full = { confidence: 0.7, verified_count: 2, signals: ['language', 'reaction', 'behavior'].map(sig) };

test('3조건을 모두 만족해야 confirmed', () => {
  assert.equal(statusOf(full), 'confirmed');
});

test('셋 중 하나라도 빠지면 confirmed가 아니다', () => {
  assert.notEqual(statusOf({ ...full, confidence: 0.69 }), 'confirmed');
  assert.notEqual(statusOf({ ...full, verified_count: 1 }), 'confirmed');
  assert.notEqual(statusOf({ ...full, signals: [sig('language'), sig('reaction')] }), 'confirmed');
});

test('신호 2겹이면 testing — Act 2 진입 조건', () => {
  assert.equal(statusOf({ confidence: 0.2, verified_count: 0, signals: [sig('language'), sig('behavior')] }), 'testing');
});

test('근거가 얕으면 forming', () => {
  assert.equal(statusOf({ confidence: 0.1, verified_count: 0, signals: [sig('language')] }), 'forming');
  assert.equal(statusOf({}), 'forming');
});

test('dropped가 모든 판정을 이긴다', () => {
  assert.equal(statusOf({ ...full, dropped: true }), 'dropped');
});

test('Act은 날짜가 아니라 가설 상태에 종속된다', () => {
  assert.equal(applyStatus({ hypotheses: [] }).act, 1, '가설이 없으면 Act 1');
  // 셋 중 하나만 걸려도 testing → Act 2 (여기서는 confidence만 넘긴 경우)
  assert.equal(applyStatus({ hypotheses: [{ confidence: 0.75, verified_count: 0, signals: [] }] }).act, 2);
  assert.equal(applyStatus({ hypotheses: [{ confidence: 0.1, verified_count: 2, signals: [] }] }).act, 2);
  assert.equal(applyStatus({ hypotheses: [full] }).act, 3, 'confirmed면 Act 3');
});

test('confirmed 가설을 찾아 넘긴다', () => {
  const out = applyStatus({ hypotheses: [{ id: 'a', signals: [] }, { id: 'b', ...full }] });
  assert.equal(out.confirmed.id, 'b');
  assert.equal(out.hypotheses[0].status, 'forming');
});

test('missing은 부족한 조건만 정확히 짚는다', () => {
  assert.deepEqual(missing(full), []);
  const m = missing({ confidence: 0.3, verified_count: 0, signals: [sig('language')] });
  assert.equal(m.length, 3);
  assert.ok(m.some((s) => s.includes('0.30')));
  assert.ok(m.some((s) => s.includes('0/2')));
  assert.ok(m.some((s) => s.includes('reaction') && s.includes('behavior')));
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
  let list = [h({ signals: [{ kind: 'behavior' }] })];
  for (let d = 1; d <= 3; d++) list = applyVerdicts(list, [{ id: 'h1', verdict: 'supported' }], d);
  assert.equal(list[0].confidence, 0.7);
  assert.equal(statusOf(list[0]), 'testing');
});

test('신호는 쌓인다 — 오늘 안 나온 겹이 사라지면 confirmed가 풀린다', () => {
  const judged = [{
    id: 'h1', confidence: 0.8, verified_count: 3,
    signals: [{ kind: 'behavior', evidence: 'b1' }, { kind: 'reaction', evidence: 'r1' }],
  }];
  // analyst는 오늘 본 language 하나만 다시 써 보낸다
  const proposed = [{ id: 'h1', desire: 'd', statement: 's', dropped: false, signals: [{ kind: 'language', evidence: 'l1' }] }];
  const [out] = mergeAnalysis(judged, proposed);

  const kinds = new Set(out.signals.map((s) => s.kind));
  assert.equal(kinds.size, 3, '어제 겹이 살아 있어야 한다');
  assert.equal(statusOf(out), 'confirmed');
});

test('같은 근거는 두 번 쌓이지 않는다', () => {
  const judged = [{ id: 'h1', confidence: 0.5, verified_count: 1, signals: [{ kind: 'behavior', evidence: 'b1' }] }];
  const proposed = [{ id: 'h1', desire: 'd', statement: 's', dropped: false, signals: [{ kind: 'behavior', evidence: 'b1' }] }];
  const [out] = mergeAnalysis(judged, proposed);
  assert.equal(out.signals.length, 1);
});
