// 캐릭터 상태 수치 — 수면 · 스트레스 · 포만감.
//
// ⚠️ 지금은 **표시만 한다.** 게임 규칙에 아무 영향이 없다.
// 그릇을 먼저 만들어 두는 것이고, 무엇을 어떻게 깎을지는 나중에 정한다.
// 붙일 때 주의: 이 게임은 "감점 없음, 처벌 없음, 오직 가점만"이다(DESIGN.md §2).
// 수치가 낮다고 점수를 깎으면 원칙이 깨진다 — 기회를 줄이는 쪽으로만 쓸 것.

export const VITALS = {
  sleep: { label: '수면', start: 100, perGameHour: -4 },
  stress: { label: '스트레스', start: 20, perGameHour: 2 },
  fullness: { label: '포만감', start: 70, perGameHour: -5 },
};

const clamp = (n) => Math.max(0, Math.min(100, n));

export function initialVitals(carry) {
  const v = {};
  for (const [k, def] of Object.entries(VITALS)) {
    v[k] = clamp(carry?.[k] ?? def.start);
  }
  return v;
}

/** 게임 시간이 흐른 만큼 깎는다. @param {number} gameMinutes */
export function tickVitals(v, gameMinutes) {
  const hours = gameMinutes / 60;
  const out = {};
  for (const [k, def] of Object.entries(VITALS)) {
    out[k] = clamp(v[k] + def.perGameHour * hours);
  }
  return out;
}

/** 잠을 자면 수면이 차고 스트레스가 내린다. 안 자고 넘기면 그대로 이어진다. */
export function afterSleep(v) {
  return {
    ...v,
    sleep: clamp(v.sleep + 70),
    stress: clamp(v.stress - 25),
  };
}

export const vitalsLine = (v) =>
  Object.entries(VITALS).map(([k, def]) => `${def.label} ${Math.round(v[k])}`).join('  ');
