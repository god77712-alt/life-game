// 가설 테이블 → 화면 줄.
//
// 여기서 지키려는 것은 둘이다.
//   1. **빈칸을 내지 않는다** — 가설의 모양이 바뀌어도(desire → who·through·when)
//      화면에 undefined가 뜨면 안 된다. 실제로 두 곳에서 뜨고 있었다
//   2. **폭을 넘지 않는다** — 캔버스가 384px뿐이라 긴 문장이 상자를 뚫는다

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actOf, actLine, hypoLabel, ranked, cols, clip, settleLines, devLine, WIDTH,
} from '../src/game/table.js';

// ── Act ──────────────────────────────────────────────────────

test('Act은 서버가 준 가설 상태를 따른다', () => {
  assert.equal(actOf({ act: 1 }), 1);
  assert.equal(actOf({ act: 2 }), 2);
  assert.equal(actLine({ act: 2 }), 'Act 2  골 발견');
});

test('붕괴 당일은 3막, 하루 지나야 4막', () => {
  const s = { collapsed: true, collapsedOn: 7 };
  assert.equal(actOf({ act: 3 }, { ...s, day: 7 }), 3, '붕괴 당일에 현실을 요구하지 않는다');
  assert.equal(actOf({ act: 3 }, { ...s, day: 8 }), 4);
  assert.equal(actLine({ act: 3 }, { ...s, day: 8 }), 'Act 4  현실 전환');
});

test('붕괴가 예약만 된 상태도 3막', () => {
  assert.equal(actOf({ act: 2 }, { collapseNext: true }), 3);
});

test('테이블이 없어도 1막. 깨진 값은 무시한다', () => {
  assert.equal(actOf(null), 1);
  assert.equal(actOf({}), 1);
  assert.equal(actOf({ act: 99 }), 1);
  assert.equal(actOf({ act: 'two' }), 1);
});

// ── 이름 ─────────────────────────────────────────────────────

test('label이 있으면 그대로', () => {
  assert.equal(hypoLabel({ label: '지훈 · 고양이 · 약속 없을 때' }), '지훈 · 고양이 · 약속 없을 때');
});

test('label이 없으면 who·through·when으로 짓는다', () => {
  assert.equal(hypoLabel({ who: '지훈', through: '고양이', when: '밤' }), '지훈 · 고양이 · 밤');
});

test("'none'은 이름에 넣지 않는다 — 아직 모른다는 뜻이다", () => {
  assert.equal(hypoLabel({ who: 'none', through: '고양이', when: 'none' }), '고양이');
});

test('아무것도 없으면 statement, 그것도 없으면 id. 빈칸은 없다', () => {
  assert.equal(hypoLabel({ who: 'none', statement: '문장' }), '문장');
  assert.equal(hypoLabel({ id: 'h1' }), 'h1');
  assert.equal(hypoLabel({}), '—');
  assert.equal(hypoLabel(null), '—');
});

test('옛 형태(desire)도 읽는다 — 저장된 판이 남아 있다', () => {
  assert.equal(hypoLabel({ desire: '요리' }), '요리');
});

// ── 정렬 ─────────────────────────────────────────────────────

test('confirmed가 맨 위, 그다음 confidence 순', () => {
  const t = { hypotheses: [
    { id: 'a', confidence: 0.9, status: 'testing' },
    { id: 'b', confidence: 0.3, status: 'confirmed' },
    { id: 'c', confidence: 0.5, status: 'testing' },
  ] };
  assert.deepEqual(ranked(t).map((h) => h.id), ['b', 'a', 'c']);
});

test('버려진 가설은 화면에 안 나온다', () => {
  const t = { hypotheses: [{ id: 'a', dropped: true }, { id: 'b', status: 'dropped' }, { id: 'c' }] };
  assert.deepEqual(ranked(t).map((h) => h.id), ['c']);
});

// ── 폭 ───────────────────────────────────────────────────────

test('한글은 두 칸으로 센다', () => {
  assert.equal(cols('abc'), 3);
  assert.equal(cols('가나다'), 6);
  assert.equal(cols('a가'), 3);
});

test('넘치면 자르고, 잘렸다는 걸 남긴다', () => {
  assert.equal(clip('짧다', 10), '짧다');
  const out = clip('아주아주아주아주 긴 문장이다', 10);
  assert.ok(cols(out) <= 10);
  assert.ok(out.endsWith('…'));
});

// ── 정산창 ───────────────────────────────────────────────────

const TABLE = {
  act: 2,
  hypotheses: [
    {
      id: 'h1', label: '지훈 · 고양이 · 약속 없을 때', status: 'testing',
      confidence: 0.45, verified_count: 1,
      missing: ['지훈에게 자기 얘기 0/1회', 'confidence 0.45 < 0.7'],
    },
    { id: 'h2', label: '새벽 편의점 · 점원 없는 시간', status: 'forming', confidence: 0.2 },
    { id: 'h3', label: '세 번째', status: 'forming', confidence: 0.2 },
  ],
  avoidance: { pattern: '응답이 돌아오는 상태를 피한다' },
};

test('며칠째고 뭐가 쌓였는지가 줄에 있다', () => {
  const out = settleLines(TABLE).join('\n');
  assert.match(out, /Act 2 {2}골 발견/);
  assert.match(out, /지훈 · 고양이 · 약속 없을 때/);
  assert.match(out, /testing {2}0\.45 {2}검증 1회/);
  assert.match(out, /남은 것 — 지훈에게 자기 얘기 0\/1회/, '왜 아직 확정이 아닌지가 보여야 한다');
  assert.match(out, /회피 {2}응답이 돌아오는 상태를 피한다/);
});

test('맨 위 가설만 자세히, 나머지는 한 줄씩', () => {
  const out = settleLines(TABLE);
  assert.match(out.join('\n'), /Act 2 {2}골 발견 · 가설 3/, '몇 개를 놓고 재는 중인지가 보인다');
  // 자세한 줄(남은 것)은 맨 위 하나에만 붙는다
  assert.equal(out.filter((l) => l.startsWith('남은 것')).length, 1);
  assert.ok(out.includes('· 새벽 편의점 · 점원 없는 시간 (0.20)'));
  assert.ok(out.includes('· 세 번째 (0.20)'));
});

test('중요한 것이 앞에 온다 — 뒤에서부터 잘려도 남게', () => {
  const out = settleLines(TABLE, { pending: true });
  assert.ok(out.indexOf('오늘 하루를 읽는 중…') < out.findIndex((l) => l.startsWith('회피')),
    '기다리는 화면에서는 "읽는 중"이 회피 문장보다 먼저다');
  assert.ok(out.findIndex((l) => l.startsWith('Act ')) < out.indexOf('지훈 · 고양이 · 약속 없을 때'));
});

test('확정된 가설에는 별이 붙고 "남은 것"이 사라진다', () => {
  const t = { act: 3, hypotheses: [{ id: 'h1', label: 'ㄱ', status: 'confirmed', confidence: 0.8, verified_count: 2, missing: ['있으면 안 된다'] }] };
  const out = settleLines(t).join('\n');
  assert.match(out, /★ confirmed/);
  assert.ok(!out.includes('남은 것'));
});

test('첫 밤 — 가설이 없으면 없다고 적는다', () => {
  assert.ok(settleLines({}).includes('아직 세운 가설이 없다'));
  assert.ok(settleLines({}, { pending: true }).includes('오늘 하루를 읽는 중…'));
});

test('정산이 도는 동안과 실패했을 때가 화면에 남는다', () => {
  assert.ok(settleLines(TABLE, { pending: true }).includes('오늘 하루를 읽는 중…'));
  const failed = settleLines(TABLE, { error: '끊겼다' }).join('\n');
  assert.match(failed, /읽지 못했다 — 끊겼다/, '조용히 실패하면 안 된다');
});

test('어떤 줄도 정산창 폭을 넘지 않는다', () => {
  const long = {
    act: 2,
    hypotheses: [{
      id: 'h1',
      label: '아주 긴 이름을 가진 가설인데 이런 것도 모델은 태연히 내놓는다 정말로 길게',
      status: 'testing', confidence: 0.45, verified_count: 1,
      missing: ['이유도 아주 길게 적어 보낼 수 있다 실제로 그런 적이 있었고 앞으로도 있을 것이다'],
    }],
    avoidance: { pattern: '회피 패턴도 한 문단으로 써 보내는 날이 반드시 온다 그날 상자가 뚫린다' },
  };
  for (const line of settleLines(long, { error: '아주 긴 오류 메시지가 그대로 흘러들어오는 경우도 있다 예를 들면 스택' })) {
    assert.ok(cols(line) <= WIDTH, `폭 초과: ${line}`);
  }
});

// ── DEV 패널 ─────────────────────────────────────────────────

test('DEV 패널과 정산창은 같은 이름을 쓴다', () => {
  const dev = devLine(TABLE);
  assert.match(dev, /지훈 · 고양이 · 약속 없을 때/);
  assert.match(dev, /Act 2 {2}골 발견/);
  assert.ok(!dev.includes('undefined'), '옛 필드를 읽어 undefined를 띄우던 자리다');
});

test('가설이 없으면 DEV 줄도 비어 있다', () => {
  assert.equal(devLine({}), '');
});
