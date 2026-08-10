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

/**
 * 무엇을 하면 얼마나 오르는가.
 *
 * **말을 섞었다는 것만으로는 안 오른다.** 다가가서 선택지를 하나 누른 건
 * 남이 써준 말을 고른 것이고, 그걸로 사람 마음이 열리지는 않는다 —
 * 그렇게 두면 NPC를 한 바퀴 돌며 아무 선택지나 눌러 호감도를 채울 수 있고,
 * 그 순간 이 숫자는 아무것도 안 재는 숫자가 된다.
 *
 * 오르는 건 둘뿐이다: **자기 말을 직접 한 것**과 **뭔가를 실제로 해준 것.**
 */
export const GAIN = {
  spoke: 3,       // 선택지 대신 **자기 말을 직접 썼다**
  favor: 10,      // 부탁을 들어줬거나 필요한 걸 건넸다
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

/**
 * 관계의 단계. **경계 숫자가 사는 곳은 여기 하나다** —
 * 다른 파일이 "45 미만이면 아직 안 친하다"를 자기 숫자로 또 알면
 * 밴드를 조정하는 날 한쪽만 움직인다 (CLAUDE.md 코딩 규칙).
 */
export const BANDS = [
  { at: 90, label: '가족' },
  { at: 70, label: '가깝다' },
  { at: 45, label: '편하다' },
  { at: 20, label: '아는 사이' },
  { at: 0, label: '서먹하다' },
];

/** 호감도가 어느 단계인가 — 숫자만 보여주면 무슨 뜻인지 모른다 */
export function bandOf(v) {
  return (BANDS.find((b) => v >= b.at) ?? BANDS.at(-1)).label;
}

/**
 * 아직 **트기 전**인가. 서먹하거나 겨우 아는 사이.
 *
 * 이 구간에서만 할 수 있는 일이 있다 — 흘린 말이 그렇다(game/wants.js).
 * 편해진 뒤에는 물건이 필요 없다. 그때부터는 말이 오간다(`confide`).
 */
export const EARLY = BANDS.find((b) => b.label === '편하다').at;
export const isEarly = (v) => v < EARLY;

/** 상태창 한 줄들. 만난 적 있는 사람만 나온다 */
export function affinityLines(state, names = {}) {
  return Object.entries(state ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([npc, v]) => ({
      npc, value: v, band: bandOf(v),
      name: names[npc] ?? DEFAULT_NAMES[npc] ?? npc,
    }));
}
