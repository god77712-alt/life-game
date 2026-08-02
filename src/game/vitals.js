// 캐릭터 상태 — 허기 · 피로. 화면 오른쪽 위 상태창에 게이지로 뜬다.
//
// 둘 다 **100에서 시작해 시간이 갈수록 닳는다.** 게이지가 줄어드는 것이 곧
// 배가 고파지고 지쳐가는 것이다. 자면 피로가 크게 차고 허기도 조금 찬다(자는 동안은 안 먹으니까).
//
// ⚠️ **규칙에는 영향이 없다.** 0이 돼도 점수를 깎지 않고 행동을 막지 않는다 —
// 이 게임은 "감점 없음, 처벌 없음, 오직 가점만"이다(DESIGN.md §2).
// 수치는 **자야 할 이유**를 눈에 보이게 하는 장치이지 벌이 아니다.
// 나중에 붙인다면 기회를 줄이는 쪽으로만 (예: 특정 이벤트가 안 열림).

export const VITALS = {
  hunger: { label: '허기', start: 80, perGameHour: -3.2, low: '배가 고프다' },
  fatigue: { label: '피로', start: 70, perGameHour: -4.0, low: '눈이 감긴다' },
};

/** 이 아래로 내려가면 상태창이 붉어지고 한 줄이 붙는다 */
export const LOW = 25;

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
    out[k] = clamp((v?.[k] ?? def.start) + def.perGameHour * hours);
  }
  return out;
}

/** 자고 나면 피로가 크게 차고 허기는 조금만 — 자는 동안 먹지는 않았다 */
export function afterSleep(v) {
  return {
    hunger: clamp((v?.hunger ?? 0) + 15),
    fatigue: clamp((v?.fatigue ?? 0) + 75),
  };
}

/** 먹으면 허기가 찬다. 물 마시기·편의점 같은 행동에 붙는다 */
export function afterEat(v, amount = 30) {
  return { ...v, hunger: clamp((v?.hunger ?? 0) + amount) };
}

/** 지금 신경 쓰이는 상태 한 줄. 없으면 null */
export function vitalsNote(v) {
  const low = Object.entries(VITALS)
    .filter(([k]) => (v?.[k] ?? 100) <= LOW)
    .sort((a, b) => (v[a[0]] ?? 100) - (v[b[0]] ?? 100))[0];
  return low ? low[1].low : null;
}

export const vitalsLine = (v) =>
  Object.entries(VITALS).map(([k, def]) => `${def.label} ${Math.round(v?.[k] ?? 0)}`).join('  ');
