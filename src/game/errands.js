// 부탁 — 누가 무엇을 부탁했고, 했는가 **안 했는가.**
//
// ⚠️ 여기가 이 게임에서 가장 오염되기 쉬운 자리다. 셋을 지킨다:
//
// 1. **대가가 없다.** 포인트를 주면 "엄마라서 했다"와 "포인트라서 했다"가 섞이고,
//    게임은 그걸 관계 신호로 읽는다. 보상은 호감도뿐이고 그건 가설 판정에 안 들어간다.
//    값이 모두 같으면 "하느냐"는 흐려져도 **"누구 것부터 하느냐"는 남는다.**
//
// 2. **안 한 것이 자료다.** 이 게임에서 회피를 읽는 가장 강한 증거는 안 한 쪽이다
//    (observer.js의 passed·unseen과 같은 근거). 부탁도 같은 체계에 들어가야 한다.
//    거절·무시가 기록되지 않으면 부탁은 그냥 심부름 퀘스트가 된다.
//
// 3. **행동에 이유가 붙는다.** 빨래바구니를 비운 것이 스스로 한 청소(L1 행동 신호)인지
//    엄마가 시켜서 한 것(관계 신호)인지는 완전히 다른 읽기다. 구분이 없으면
//    analyst는 같은 줄을 보고 매번 다르게 지어낸다.
//
// **부탁 문장은 여기 없다.** 디렉터가 매일 만든다 — 고정 문자열을 박는 순간
// 엄마는 매일 같은 걸 시키는 사람이 되고, 그건 관측할 게 없다는 뜻이다.

import { TYPES } from '../room/schema.js';
import { ORDER as ITEM_IDS } from './shop.js';

/**
 * 코드가 **확인할 수 있는** 부탁만 받는다.
 * 모델이 "기분 좀 풀어줘" 같은 걸 내면 판정할 방법이 없으므로 조용히 버린다.
 */
export const KINDS = {
  clean: { label: '치우기', targets: () => TYPES },       // 그 물건을 치운다
  look: { label: '보기', targets: () => TYPES },          // 그 물건을 들여다본다
  visit: { label: '다녀오기', targets: (maps) => new Set(maps) },
  give: { label: '건네기', targets: () => new Set(ITEM_IDS) },
};

/**
 * 디렉터가 낸 부탁을 걸러 오늘의 목록으로. **못 알아먹는 건 버린다** —
 * 모델 출력이 게임을 멈추게 할 수는 없다 (골 맵에서 이미 겪었다).
 *
 * @param {Array} raw 디렉터의 errands
 * @param {string[]} mapIds 존재하는 맵 id
 * @param {string[]} npcIds 존재하는 인물 id
 */
export function accept(raw, mapIds = [], npcIds = []) {
  const out = [];
  const seen = new Set();
  for (const e of raw ?? []) {
    const kind = KINDS[e?.kind];
    if (!kind) continue;
    if (!kind.targets(mapIds).has(e.target)) continue;
    if (!e.npc || !npcIds.includes(e.npc)) continue;      // 없는 사람의 부탁은 없다
    if (seen.has(e.npc)) continue;                        // 한 사람이 하루에 하나만
    if (!e.text) continue;
    seen.add(e.npc);
    out.push({
      id: `er_${e.npc}_${out.length}`,
      npc: e.npc, text: String(e.text), kind: e.kind, target: e.target,
      asked_at: null, done_at: null,
    });
  }
  return out.slice(0, 3);      // 하루 셋까지. 넘으면 심부름 목록이 된다
}

/** 그 사람이 부탁을 꺼냈다 (다가가서 들었다) */
export function ask(errands, npc, at) {
  return errands.map((e) => (e.npc === npc && !e.asked_at ? { ...e, asked_at: at } : e));
}

/**
 * 방금 한 행동이 누군가의 부탁이었는가.
 *
 * **들은 적 없는 부탁은 완료되지 않는다** — 우연히 한 것을 "부탁을 들어줬다"로
 * 세면 관계 신호가 부풀려진다. 만나서 들은 것만 닫힌다.
 *
 * @param {{kind: string, target: string}} action
 * @returns {{errands: Array, closed: Array}}
 */
export function complete(errands, action, at) {
  const closed = [];
  const next = errands.map((e) => {
    if (e.done_at || !e.asked_at) return e;
    if (e.kind !== action.kind || e.target !== action.target) return e;
    const done = { ...e, done_at: at };
    closed.push(done);
    return done;
  });
  return { errands: next, closed };
}

/** 아직 안 한, 이미 들은 부탁들 */
export const openOf = (errands, npc = null) =>
  errands.filter((e) => e.asked_at && !e.done_at && (npc === null || e.npc === npc));

/** 이 행동이 지금 열려 있는 부탁 때문인가 — 관측에 붙일 이유 태그 */
export function whyOf(errands, action) {
  const hit = errands.find((e) => e.asked_at && !e.done_at
    && e.kind === action.kind && e.target === action.target);
  return hit ? { why: 'errand', for: hit.npc } : { why: 'self', for: null };
}

/**
 * 정산에 넘길 형태. **안 한 것이 빠지면 안 된다** —
 * 여기서 `done:false`가 사라지면 이 파일을 만든 이유가 없어진다.
 */
export function summary(errands) {
  return errands.map((e) => ({
    npc: e.npc,
    text: e.text,
    kind: e.kind,
    target: e.target,
    heard: !!e.asked_at,          // 만나서 듣기는 했는가
    done: !!e.done_at,
    asked_at: e.asked_at,
    done_at: e.done_at,
  }));
}

/** 한 줄 요약 — DEV 패널용 */
export const line = (errands) =>
  errands.map((e) => `${e.npc}:${e.done_at ? '✓' : e.asked_at ? '…' : '·'}`).join(' ') || '없음';
