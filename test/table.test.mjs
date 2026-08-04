// 가설 테이블 → 화면 줄.
//
// 여기서 지키려는 것은 둘이다.
//   1. **빈칸을 내지 않는다** — 가설의 모양이 바뀌어도(desire → who·through·when)
//      화면에 undefined가 뜨면 안 된다. 실제로 두 곳에서 뜨고 있었다
//   2. **폭을 넘지 않는다** — 캔버스가 384px뿐이라 긴 문장이 상자를 뚫는다

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actOf, actLine, hypoLabel, ranked, cols, clip, settleLines, devLine, counted, WIDTH,
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
      id: 'h1', axis: 'want', label: '지훈 · 고양이 · 약속 없을 때', status: 'testing',
      confidence: 0.45, verified_count: 1,
      missing: ['지훈에게 자기 얘기 0/1회', 'confidence 0.45 < 0.7'],
    },
    { id: 'h2', axis: 'avoid', label: '새벽 편의점 · 점원 없는 시간', status: 'forming', confidence: 0.2 },
    { id: 'h3', label: '세 번째', status: 'forming', confidence: 0.2 },
  ],
  avoidance: { pattern: '응답이 돌아오는 상태를 피한다' },
};

test('며칠째고 뭐가 쌓였는지가 줄에 있다', () => {
  const out = settleLines(TABLE).join('\n');
  assert.match(out, /Act 2 {2}골 발견/);
  assert.match(out, /지훈 · 고양이 · 약속 없을 때/);
  assert.match(out, /남은 것 — 지훈에게 자기 얘기 0\/1회/, '왜 아직 확정이 아닌지가 보여야 한다');
  assert.match(out, /회피 {2}새벽 편의점/, '두 갈래가 나란히 보여야 진행이 절반만 보이지 않는다');
  assert.match(out, /바람 {2}지훈 · 고양이/);
});

test('회피 가설이 아직 없으면 요약을 대신 띄우되 **가설이 아니라고 적는다**', () => {
  const t = { ...TABLE, hypotheses: [TABLE.hypotheses[0]] };
  const out = settleLines(t).join('\n');
  assert.match(out, /회피\(가설 이전\) {2}응답이 돌아오는/,
    '검증 안 된 문장이 확정된 것처럼 보이면 안 된다');
});

test('**소수점을 안 띄운다** — 없는 정밀도를 주장하지 않는다', () => {
  // confidence는 통계량이 아니라 코드가 ±상수씩 옮긴 내부 카운터다.
  // n=1 자료로 0.45를 띄우면 있지도 않은 정밀도를 주장하는 것이 된다
  const out = settleLines(TABLE).join('\n');
  assert.equal(/\d\.\d\d/.test(out), false, `소수점이 남아 있다:\n${out}`);
  // 대신 **센 것**이 적힌다
  assert.match(out, /검증 1\/2/);
  assert.match(out, /자기얘기 0\/1/);
  assert.match(out, /말[✓·] 반응[✓·] 행동[✓·]/, '어느 겹이 비었는지가 보여야 한다');
});

test('센 것은 전부 개수다 — 물어보면 그대로 답할 수 있어야 한다', () => {
  const h = {
    signals: [{ kind: 'language' }, { kind: 'behavior' }],
    verified_count: 1, opened_to_who: 0,
  };
  const line = counted(h, { layers: ['language', 'reaction', 'behavior'], verifications: 2, needsOpening: 1 });
  assert.match(line, /말✓/);
  assert.match(line, /반응·/, '없는 겹은 · 로');
  assert.match(line, /행동✓/);
  assert.match(line, /검증 1\/2/);
  assert.match(line, /자기얘기 0\/1/);
});

test('문턱은 서버가 보낸 값을 쓴다 — 화면이 다시 적으면 갈라진다', () => {
  const h = { signals: [], verified_count: 0, opened_to_who: 0 };
  const line = counted(h, { layers: ['language'], verifications: 5, needsOpening: 3 });
  assert.match(line, /검증 0\/5/, '서버가 5라고 하면 5로 보여야 한다');
  assert.match(line, /자기얘기 0\/3/);
  assert.equal(/반응/.test(line), false, '서버가 안 보낸 겹은 안 그린다');
});

test('갈래마다 맨 위 하나씩 자세히, 나머지는 한 줄씩', () => {
  const out = settleLines(TABLE);
  assert.match(out.join('\n'), /Act 2 {2}골 발견 · 가설 3/, '몇 개를 놓고 재는 중인지가 보인다');
  assert.equal(out.filter((l) => l.startsWith('남은 것')).length, 1,
    '둘 다 띄우면 정산창을 넘긴다 — 덜 찬 쪽 하나만');
  assert.ok(out.includes('· 세 번째'), '갈래 대표가 아닌 것은 한 줄로');
});

test('거울 인물이 섰으면 정산창에 나온다 — "저 사람이 왜 계속 나오지"의 답', () => {
  const out = settleLines(TABLE, {
    mirrorCast: { name: '벤치의 남자', carries: '날짜를 안 정한다' },
  }).join('\n');
  assert.match(out, /거울 {2}벤치의 남자 — 날짜를 안 정한다/);
});

test('중요한 것이 앞에 온다 — 뒤에서부터 잘려도 남게', () => {
  const out = settleLines(TABLE, { pending: true });
  assert.ok(out.indexOf('오늘 하루를 읽는 중…') < out.findIndex((l) => l.startsWith('회피')),
    '기다리는 화면에서는 "읽는 중"이 회피 문장보다 먼저다');
  assert.ok(out.findIndex((l) => l.startsWith('Act ')) < out.findIndex((l) => l.startsWith('바람')));
});

test('확정된 가설에는 별이 붙고 "남은 것"이 사라진다', () => {
  const t = { act: 3, hypotheses: [{
    id: 'h1', label: 'ㄱ', status: 'confirmed', confidence: 0.8,
    verified_count: 2, opened_to_who: 1,
    signals: [{ kind: 'language' }, { kind: 'reaction' }, { kind: 'behavior' }],
    missing: ['있으면 안 된다'],
  }] };
  const out = settleLines(t).join('\n');
  assert.match(out, /★ 확인됨/);
  assert.match(out, /검증 2\/2/);
  assert.match(out, /말✓ 반응✓ 행동✓/, '확인됐으면 세 겹이 다 차 있어야 한다');
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
