// 호감도 — **NPC가 플레이어에게** 갖는 마음. 0~100.
//
// 방향이 중요하다. 플레이어가 누구를 좋아하는지가 아니라 **누가 플레이어에게 열려 있는지**다.
// 이 게임의 목표가 "이 사람이 누군가에게 자기 이야기를 하게 만드는 것"이므로,
// 상대 쪽 문이 얼마나 열렸는지를 재는 게 맞다 (hypothesis.mjs의 needsOpening과 같은 방향).
//
// **엄마는 100 고정이다.** 오르지도 내리지도 않는다 —
// 잘해서 얻는 것도 아니고 잘못해서 잃는 것도 아닌 자리가 하나는 있어야 한다.
//
// 감점은 없다. 안 만나면 안 오를 뿐이다 (DESIGN.md §2 "감점 없음, 처벌 없음").

export const PINNED = { mom: 100 };

/** 아직 안 만난 사람도 상태창에 뜬다(엄마). 키가 그대로 보이면 안 된다 */
export const DEFAULT_NAMES = { mom: '엄마' };

export const START = 10;

/** 무엇을 하면 얼마나 오르는가 */
export const GAIN = {
  talk: 2,        // 다가가서 대화를 끝냈다
  spoke: 3,       // 선택지 대신 **자기 말을 직접 썼다** — 더 크다
  favor: 10,      // 부탁을 들어줬다
};

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** 저장에서 복원하거나 새로 시작한다 */
export function initialAffinity(carry) {
  return { ...PINNED, ...(carry ?? {}), ...PINNED };
}

/** 그 사람의 지금 호감도. 모르는 사람은 시작값 */
export function affinityOf(state, npc) {
  if (!npc) return null;
  if (npc in PINNED) return PINNED[npc];
  return state?.[npc] ?? START;
}

/**
 * 올린다. **고정된 사람은 움직이지 않는다.**
 * @param {object} state
 * @param {string} npc
 * @param {keyof GAIN} kind
 * @returns {{state: object, from: number, to: number, moved: boolean}}
 */
export function raise(state, npc, kind) {
  const from = affinityOf(state, npc);
  if (!npc || npc in PINNED || !(kind in GAIN)) {
    return { state, from, to: from, moved: false };
  }
  const to = clamp(from + GAIN[kind]);
  return { state: { ...state, [npc]: to }, from, to, moved: to !== from };
}

/** 호감도가 어느 단계인가 — 숫자만 보여주면 무슨 뜻인지 모른다 */
export function bandOf(v) {
  if (v >= 90) return '가족';
  if (v >= 70) return '가깝다';
  if (v >= 45) return '편하다';
  if (v >= 20) return '아는 사이';
  return '서먹하다';
}

/** 상태창 한 줄들. 만난 적 있는 사람만 나온다 */
export function affinityLines(state, names = {}) {
  return Object.entries(state ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([npc, v]) => ({
      npc, value: v, band: bandOf(v),
      name: names[npc] ?? DEFAULT_NAMES[npc] ?? npc,
    }));
}
