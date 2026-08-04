// `confirmed` 판정은 코드가 한다. 모델이 아니라.
//
// CLAUDE.md가 3조건을 "상수로 두고 건드리지 않는다"고 못박았으므로,
// 이 판정을 모델에게 맡기면 상수가 매 호출마다 흔들린다. 모델은 근거(신호·confidence)만 내고
// 문턱은 여기서 결정론적으로 넘는다. 순수 함수 — 테스트로 고정.

export const CONFIRM = {
  confidence: 0.7,      // confidence ≥ 0.7
  verifications: 2,     // 검증 이벤트 2회 이상 통과
  layers: ['language', 'reaction', 'behavior'],   // 3겹 신호 모두 존재

  // ── 아래 둘은 목표가 바뀌면서 새로 생긴 조건이다 ──────────
  //
  // 10일 시뮬레이션에서 confirmed된 건 '고양이에게 밥 주기'였다. 혼자 하는 일이다.
  // 골 맵은 거기 맞춰 "의자는 벽을 보게 놓여 마주 앉는 구도가 안 만들어진다"로 지어졌다.
  // **문턱을 없애랬더니 사람을 없앤 것이다.**
  //
  // 이 게임의 목표는 취향을 알아내는 게 아니라 이 사람이 누군가에게 자기 얘기를 하는 것이다.
  // 그러니 상대가 없는 가설은 아무리 확실해도 답이 아니다.

  needsWho: true,       // 가설이 **상대를 지목**해야 한다
  needsOpening: 1,      // 그 상대에게 **실제로 자기 얘기를 한 적**이 있어야 한다
};

/**
 * 가설은 **두 갈래다.** 알아내야 할 것이 둘이고, 각각이 만드는 것이 다르다.
 *
 *   avoid  무엇으로부터 자기를 지키고 있는가  →  거울 인물이 그 회피를 갖는다
 *   want   무엇을 해보고 싶은가              →  골 맵이 그 무대로 열린다
 *
 * 한 갈래로 두면 둘 중 하나가 반드시 부속물이 된다. 실제로 그랬다 —
 * 회피는 검증 없는 한 문장(`avoidance.pattern`)으로 떠 있었고, 바람은
 * 8/1에 `desire`를 걷어내면서 통째로 사라졌다. 그래서 골 맵은 검증을 안 거친
 * "자기 입으로 한 말"에서 바로 지어졌다.
 *
 * **자기 개방 조건은 갈래마다 다르다.** 바람은 그 사람에게 말을 해봐야 알 수 있지만,
 * 회피는 **안 한 것**에서 읽힌다 — 안 갔고, 안 열었고, 화제를 돌렸다.
 * 회피에 자기 개방을 요구하면 "말을 안 하는 것이 회피다"라는 가설이
 * 영영 확정될 수 없다. 그건 논리가 아니라 순환이다.
 *
 * 그래서 회피가 먼저 차고, 바람이 나중에 찬다. 거울 인물이 중반에 등장해
 * **응원할 시간이 생기는** 것도 이 순서 덕이다.
 */
export const AXES = {
  avoid: { label: '회피', needsOpening: 0, makes: '거울 인물' },
  want: { label: '바람', needsOpening: CONFIRM.needsOpening, makes: '골 맵' },
};

/** 갈래를 모르는 옛 가설은 바람으로 읽는다 — 조건이 더 빡빡한 쪽이 안전하다 */
export const axisOf = (h) => (h?.axis === 'avoid' ? 'avoid' : 'want');

/**
 * @param {object} h 가설
 * @param {number} [openedTo] 이 가설이 지목한 상대에게 자기 얘기를 한 횟수 (listening.js)
 * @returns {'dropped'|'confirmed'|'testing'|'forming'}
 */
export function statusOf(h, openedTo = 0) {
  if (h.dropped) return 'dropped';

  const kinds = new Set((h.signals ?? []).map((s) => s.kind));
  const layered = CONFIRM.layers.every((k) => kinds.has(k));
  const confident = (h.confidence ?? 0) >= CONFIRM.confidence;
  const verified = (h.verified_count ?? 0) >= CONFIRM.verifications;
  // 상대가 없으면 "혼자 하는 일"이다. 이 게임의 답이 될 수 없다
  const hasWho = !CONFIRM.needsWho || Boolean(h.who && h.who !== 'none');
  // 회피는 안 한 것에서 읽힌다 — 자기 개방을 요구하면 순환이 된다 (AXES 주석)
  const opened = openedTo >= AXES[axisOf(h)].needsOpening;

  if (confident && verified && layered && hasWho && opened) return 'confirmed';
  // 하나라도 만족하기 시작하면 검증 단계 — Act 2 진입 조건 (DESIGN.md §3)
  if (confident || verified || kinds.size >= 2) return 'testing';
  return 'forming';
}

/**
 * 상대별 자기 개방 횟수를 센다. **여기가 이 게임의 최종 지표다.**
 * @param {Array<{to?: string, self?: boolean}>} told
 */
export function openedBy(told = []) {
  const m = new Map();
  for (const t of told) {
    if (!t?.self || !t.to) continue;
    m.set(t.to, (m.get(t.to) ?? 0) + 1);
  }
  return m;
}

/**
 * 분석 결과에 status를 붙이고, 골 맵을 열 수 있는지 판정한다.
 * @param {object} analysis
 * @param {Array} [told] 여태 직접 친 문장들 (observer.told). 자기 개방 판정에 쓴다
 */
export function applyStatus(analysis, told = []) {
  const opened = openedBy(told);
  const hypotheses = (analysis?.hypotheses ?? []).map((h) => ({
    ...h,
    axis: axisOf(h),
    status: statusOf(h, opened.get(h.who) ?? 0),
    opened_to_who: opened.get(h.who) ?? 0,
  }));
  const done = hypotheses.filter((h) => h.status === 'confirmed');
  const testing = hypotheses.filter((h) => h.status === 'testing');

  // **갈래마다 따로 찬다.** 하나로 세면 회피만 두 개 확정돼도 골 맵이 열린다
  const confirmedAvoid = done.find((h) => h.axis === 'avoid') ?? null;
  const confirmedWant = done.find((h) => h.axis === 'want') ?? null;

  return {
    ...analysis,
    hypotheses,
    // 회피가 차면 거울 인물이 세상에 나온다. 응원할 시간이 필요하므로 골 맵보다 먼저다
    confirmedAvoid,
    confirmedWant,
    // 골 맵은 **둘 다** 찼을 때 열린다 — 무대(바람)에 그 사람(회피)이 서 있어야 한다
    confirmed: confirmedAvoid && confirmedWant ? confirmedWant : null,
    // Act은 날짜가 아니라 가설 상태에 종속된다 (DESIGN.md §3)
    act: confirmedAvoid && confirmedWant ? 3 : (testing.length || done.length) ? 2 : 1,
  };
}

// ── 판정 → 점수 이동 ────────────────────────────────────────
//
// **confidence를 움직이는 것은 여기뿐이다.** 모델은 판정만 내고 폭은 상수다.
// analyst가 자기 가설의 confidence를 스스로 매기던 구조를 걷어낸 자리 —
// 세우는 쪽과 채점하는 쪽이 분리돼야 반증이 가능해진다.

export const MOVE = {
  supported: 0.10,
  contradicted: -0.15,   // 반박은 지지보다 무겁다. 아니라는 증거가 더 비싸게 얻어진다
  no_data: 0,
};

/** 새로 나온 가설이 시작하는 값. 아직 아무것도 검증되지 않았다. */
export const START_CONFIDENCE = 0.2;

/** confidence는 0~1을 벗어나지 않는다. 소수점 둘째 자리까지. */
const clampConf = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

/**
 * 판정을 가설 테이블에 반영한다.
 *
 * @param {Array<object>} hypotheses  현재 가설들
 * @param {Array<{id: string, verdict: string, evidence?: string, note?: string}>} verdicts
 * @param {number} day
 * @returns {Array<object>} confidence·verified_count가 갱신된 가설들
 */
export function applyVerdicts(hypotheses, verdicts, day = 0) {
  const byId = new Map((verdicts ?? []).map((v) => [v.id, v]));

  return (hypotheses ?? []).map((h) => {
    const v = byId.get(h.id);
    if (!v || !(v.verdict in MOVE)) return h;

    const conf = clampConf((h.confidence ?? START_CONFIDENCE) + MOVE[v.verdict]);
    // 검증 횟수는 **지지됐을 때만** 오른다. 판정이 났다는 사실만으로는 안 오른다
    const verified = (h.verified_count ?? 0) + (v.verdict === 'supported' ? 1 : 0);

    return {
      ...h,
      confidence: conf,
      verified_count: verified,
      // 판정 이력을 남긴다 — audit.mjs가 "예측이 맞았는가"를 되짚는 자료
      verdicts: [...(h.verdicts ?? []), { day, verdict: v.verdict, evidence: v.evidence, note: v.note }].slice(-8),
    };
  });
}

/**
 * 판정된 테이블에 analyst의 결과를 얹는다.
 *
 * analyst는 **confidence를 매기지 않는다.** 문장을 다듬고 신호를 붙이고 새 가설을 낼 뿐이다.
 * 기존 가설의 점수는 referee가 정한 값을 그대로 쓰고, 새 가설만 시작값에서 출발한다.
 *
 * @param {Array<object>} judged   applyVerdicts를 통과한 어제까지의 가설
 * @param {Array<object>} proposed analyst가 낸 가설 목록
 */
export function mergeAnalysis(judged, proposed) {
  const prev = new Map((judged ?? []).map((h) => [h.id, h]));

  return (proposed ?? []).map((p) => {
    const old = prev.get(p.id);
    return {
      ...p,
      // 점수는 analyst가 뭐라고 보냈든 무시한다. 여기가 유일한 출처다
      confidence: old ? old.confidence : START_CONFIDENCE,
      verified_count: old?.verified_count ?? 0,
      verdicts: old?.verdicts ?? [],
      signals: mergeSignals(old?.signals, p.signals),
    };
  });
}

/**
 * 신호는 **쌓인다.** analyst는 매일 오늘 본 것만 다시 써 보내므로,
 * 덮어쓰면 어제 확인된 겹이 사라진다 — 실제로 confirmed가 하루 만에 testing으로
 * 되돌아갔다. "3겹"은 오늘 하루에 세 겹이 아니라 **여태 세 겹 다 나왔다**는 뜻이다.
 *
 * 같은 근거 문장은 한 번만. 오래된 것부터 잘라 20개까지 남긴다.
 */
function mergeSignals(oldSignals, newSignals) {
  const out = [];
  const seen = new Set();
  for (const s of [...(oldSignals ?? []), ...(newSignals ?? [])]) {
    if (!s?.kind) continue;
    const key = `${s.kind}|${s.evidence ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(-20);
}

/** 왜 아직 confirmed가 아닌가 — 디버그 뷰와 디렉터 프롬프트에 쓴다. */
export function missing(h) {
  const kinds = new Set((h.signals ?? []).map((s) => s.kind));
  const out = [];
  if (CONFIRM.needsWho && !(h.who && h.who !== 'none')) {
    out.push('상대가 없다 — 혼자 하는 일은 답이 아니다');
  }
  const need = AXES[axisOf(h)].needsOpening;
  if ((h.opened_to_who ?? 0) < need) {
    out.push(`${h.who && h.who !== 'none' ? h.who : '상대'}에게 자기 얘기 ${h.opened_to_who ?? 0}/${need}회`);
  }
  if ((h.confidence ?? 0) < CONFIRM.confidence) {
    out.push(`confidence ${(h.confidence ?? 0).toFixed(2)} < ${CONFIRM.confidence}`);
  }
  if ((h.verified_count ?? 0) < CONFIRM.verifications) {
    out.push(`검증 ${h.verified_count ?? 0}/${CONFIRM.verifications}회`);
  }
  const lack = CONFIRM.layers.filter((k) => !kinds.has(k));
  if (lack.length) out.push(`신호 부족: ${lack.join('·')}`);
  return out;
}
