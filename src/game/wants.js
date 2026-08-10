// 흘린 말을 기억한다 — 대화에서 스친 한마디가 편의점 선반과 이어지는 자리.
//
// **왜 이게 필요했나.** 지금까지 "주기"가 열리는 건 `residents.js`에 박아둔
// 정적 `wants`뿐이었다(고양이←사료, 노숙자←담요). 그건 처음부터 알 수 있는 것이라
// 플레이어가 **아무것도 안 해도** 성립한다. 대화를 들을 이유가 되지 못한다.
//
// 여기서 하는 일은 하나다: NPC가 말끝에 흘린 것("요즘 커피를 하도 마셔서")을
// 적어두고, 다음에 그 사람 앞에 섰을 때 손에 그게 있으면 행동이 `주기`로 바뀐다.
//
//   흘린다 → (표시 없음) → 편의점에서 산다 → 다음에 만났을 때 준다
//
// **표시하지 않는다.** 화면에 "커피를 원함"이라고 띄우는 순간 이건 퀘스트 목록이 되고,
// 플레이어는 대화를 듣는 대신 목록을 읽는다. 이 게임이 재려는 것은
// *들었는가*이지 *목록을 봤는가*가 아니다 — 놓치는 것도 자료다 (game/listening.js).
//
// **부탁이 아니다.** 부탁은 `errands.js`고 그건 디렉터가 내며 "해달라"고 말한다.
// 이건 아무도 해달라고 하지 않은 것이다. 그래서 관측에 붙는 이유가 다르다
// (`errand`가 아니라 `remembered` — game/observer.js).

import { ITEMS } from './shop.js';
import { isAnimal } from './residents.js';
import { isEarly } from './affinity.js';

/**
 * **하루에 한 명만 흘린다.**
 *
 * 여럿이 같은 날 흘리면 저녁에 편의점 한 번 다녀오는 것으로 다 처리되고,
 * 그 순간 이건 기억이 아니라 장보기 목록이다. 하루에 하나여야
 * "누구 것부터 하느냐"가 없고 **그 사람 것만** 남는다.
 */
export const PER_DAY = 1;

/**
 * 지금 이 사람이 흘릴 수 있는가. **거절하는 이유가 사는 곳은 여기 하나다.**
 *
 * 초반에만 나오는 장치다 — 아직 트기 전인 사람이 슬쩍 흘리고,
 * 플레이어가 그걸 들었는지로 **관심이 있는지 서로 재보는** 구간.
 * 편해진 다음에는 필요가 없다. 그때부터 오가는 건 물건이 아니라 말이다(`confide`).
 *
 *   이미 하나 들고 있다  안 준 게 있는데 새로 흘리면 놓친 것이 조용히 사라진다
 *   오늘 누가 흘렸다     하루 한 명 (PER_DAY)
 *   이미 편한 사이다     물건으로 마음을 살 구간이 아니다. 엄마(100 고정)도 여기서 걸린다
 *
 * @param {object} memory
 * @param {string|null} npc
 * @param {number} affinity 그 사람의 지금 호감도
 * @param {number} day 오늘
 */
export function canDrop(memory, npc, affinity, day = 0) {
  if (!npc || isAnimal(npc)) return false;      // 동물은 말을 안 한다
  if (heardFrom(memory, npc)) return false;
  if (!isEarly(affinity)) return false;
  return Object.values(memory ?? {}).filter((w) => w.day === day).length < PER_DAY;
}

/**
 * 흘린 말을 적는다. **코드가 감당할 수 있는 것만 남는다.**
 *
 * 조용히 버린다 — 지어낸 약속을 못 지키는 것보다 아무 일도 안 일어나는 쪽이 낫다
 * (game/effects.js와 같은 원칙). 모델에게 "대부분 none"이라고 써두긴 했지만
 * **프롬프트는 빈도를 지키지 못한다.** 매일 흘리는 날이 오면 그건 여기서 막는다.
 *
 *   상대가 없다        사물·쪽지에는 마음이 없다
 *   파는 물건이 아니다  편의점에 없는 걸 원하면 플레이어가 구할 방법이 없다
 *   때가 아니다        canDrop이 답한다
 *
 * @param {object} memory
 * @param {string|null} npc
 * @param {{item?:string, hint?:string}|null} want  AI가 낸 것
 * @param {number} day 흘린 날. "사흘 전에 한 말을 기억했다"를 정산이 알 수 있게
 * @param {number} affinity 그 사람의 지금 호감도
 * @returns {object} 새 memory (안 받아들였으면 그대로)
 */
export function noteWant(memory, npc, want, day = 0, affinity = 0) {
  const item = want?.item;
  if (!item || !ITEMS[item]) return memory ?? {};
  if (!canDrop(memory, npc, affinity, day)) return memory ?? {};
  return {
    ...(memory ?? {}),
    [npc]: { item, hint: want.hint ?? null, day },
  };
}

/** 그 사람이 흘린 것. 없으면 null */
export function heardFrom(memory, npc) {
  return (npc && memory?.[npc]) ? memory[npc] : null;
}

/**
 * **씬이 부르는 건 이 함수 하나다.**
 *
 * 정적(늘 그런 것)과 기억(오늘 들은 것)이 두 곳에 살지만, 합치는 자리는 여기 하나여야 한다.
 * 씬에서 매번 `[...prop.wants, ...]`를 쓰면 다음에 주는 자리가 하나 더 생겼을 때
 * 한쪽만 고쳐지고, 그게 8/3에 여섯 개를 만든 결함이다 (CLAUDE.md 코딩 규칙).
 *
 * **기억한 것이 앞에 온다.** `wantedFrom`이 먼저 맞는 것 하나를 집으므로,
 * 사료와 커피를 둘 다 들고 고양이 아닌 사람 앞에 섰을 때 들은 쪽이 나간다.
 *
 * @param {{npc?:string|null, wants?:string[]|null}} prop
 * @param {object} memory
 * @returns {string[]} 아이템 id들. 없으면 빈 배열
 */
export function wantsOf(prop, memory) {
  const heard = heardFrom(memory, prop?.npc);
  // **문자열이 올 수 있다.** 거울 인물의 `wants`는 아이템 id 목록이 아니라
  // "자기 손으로 한 장 찍는 것" 같은 문장이다 — 디렉터가 프롬프트용으로 쓴 필드다.
  // 거르지 않으면 `wantedFrom`이 문자열에 .find를 걸어 update 루프가 통째로 죽는다.
  // 합치는 자리가 여기 하나뿐이므로 교정도 여기서 한 번만 한다
  const stat = Array.isArray(prop?.wants) ? prop.wants : [];
  if (!heard) return stat;
  return [heard.item, ...stat.filter((id) => id !== heard.item)];
}

/**
 * 줬으니 지운다. **안 지우면 매일 같은 걸 원하는 사람이 된다** —
 * 그러면 기억이 아니라 자판기고, 커피 하나로 호감도를 계속 긁을 수 있다.
 *
 * 정적 wants는 안 건드린다. 고양이는 내일도 배가 고프다.
 */
export function forget(memory, npc, item) {
  const cur = heardFrom(memory, npc);
  if (!cur || (item && cur.item !== item)) return memory ?? {};
  const out = { ...(memory ?? {}) };
  delete out[npc];
  return out;
}

/**
 * 지금 이 사람 것으로 **기억해서** 주는 것인가.
 *
 * 정적 wants로 열린 `주기`와 구분하는 자리. 이 구분이 없으면
 * 고양이에게 사료를 준 것과 사흘 전 흘린 말을 기억해 커피를 산 것이
 * analyst 앞에서 같은 줄이 된다.
 */
export function isRemembered(memory, npc, item) {
  return heardFrom(memory, npc)?.item === item;
}

/**
 * 정산·디버그 뷰에 넘길 형태. **아직 안 준 것이 본체다** —
 * 들었는데 안 한 것은 `errands`의 `done:false`와 같은 종류의 신호다.
 */
export function summary(memory, names = {}, today = 0) {
  return Object.entries(memory ?? {}).map(([npc, w]) => ({
    npc,
    who: names[npc] ?? npc,
    item: w.item,
    label: ITEMS[w.item]?.label ?? w.item,
    hint: w.hint,
    heard_on: w.day,
    days_ago: Math.max(0, today - w.day),
  }));
}
