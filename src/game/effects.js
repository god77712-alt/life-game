// 대화가 세상을 바꾼다.
//
// "방으로 가져다 줄 수 있어?" — "그래, 이따 문 앞에 놓을게"
// 그러고 나서 **실제로 방에 밥상이 생긴다.** 말이 말로만 끝나면 대화를 할 이유가 줄고,
// 이 게임은 대화를 받아내려고 만든 게임이다.
//
// ⚠️ **모델이 지어낸 약속을 게임이 못 지키면 그게 더 나쁘다.** 그래서 셋을 지킨다:
//
// 1. **코드가 실행할 수 있는 것만 받는다.** "기분이 나아지게 해줄게"는 실행할 방법이 없다.
//    모르는 효과는 조용히 버린다 — 부탁(errands.js)과 같은 규칙이다
// 2. **곧바로 일어나지 않는다.** 말하자마자 물건이 생기면 마술이 된다.
//    "이따 놓을게"는 이따 일어나야 약속이 된다
// 3. **없는 걸 만들지 않는다.** 놓을 수 있는 건 이미 게임이 아는 오브젝트뿐이고,
//    옮길 수 있는 사람은 이미 있는 인물뿐이다

import { TYPES } from '../room/schema.js';
import { ORDER as ITEM_IDS } from './shop.js';

/** 약속한 뒤 실제로 일어나기까지 (게임 분). 곧바로 생기면 마술처럼 보인다 */
export const DELAY_MIN = 45;

export const KINDS = {
  // 물건을 어딘가에 놓는다 — 밥상을 방에 가져다주는 것이 이것
  place: (e, ctx) => TYPES.has(e.what) && ctx.maps.includes(e.map),
  // 그 사람이 그 공간으로 간다 — "이따 공원에 있을게"
  move: (e, ctx) => ctx.npcs.includes(e.who) && ctx.maps.includes(e.map),
  // 무언가를 건넨다 — "이거 가져가"
  give: (e) => ITEM_IDS.includes(e.item),
};

/**
 * 모델이 낸 효과를 받아들일지 정한다. **하나만 받는다** —
 * 한 마디에 세상이 여러 군데 바뀌면 그건 대화가 아니라 치트키다.
 *
 * @param {object} raw npc-reply의 effect
 * @param {{maps:string[], npcs:string[], at:number}} ctx
 * @returns {object|null} 받아들인 효과 (`at`에 일어날 시각이 박힌다)
 */
export function accept(raw, ctx) {
  const check = KINDS[raw?.kind];
  if (!check || !check(raw, ctx)) return null;
  return {
    kind: raw.kind,
    what: raw.what ?? null,
    map: raw.map ?? null,
    who: raw.who ?? null,
    item: raw.item ?? null,
    // 무슨 약속이었는지. 일어났을 때 화면에 그대로 쓴다
    note: String(raw.note ?? '').slice(0, 60) || null,
    at: ctx.at + DELAY_MIN,
  };
}

/** 시각이 된 것들. 나머지는 그대로 남는다 */
export function due(pending, minutes) {
  const ready = [];
  const rest = [];
  for (const e of pending ?? []) (minutes >= e.at ? ready : rest).push(e);
  return { ready, rest };
}

/** 화면에 뜰 한 줄 */
export function line(e) {
  if (e.note) return e.note;
  if (e.kind === 'place') return '무언가 놓여 있다';
  if (e.kind === 'move') return '누가 다녀갔다';
  return '무언가 생겼다';
}
