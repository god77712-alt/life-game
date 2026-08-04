// 지금 누구와 말하고 있는가 — **한 곳에서만 안다.**
//
// 이 파일이 생긴 이유는 버그 세 개가 전부 같은 뿌리였기 때문이다.
// 같은 사실("지금 이 사람과 말하는 중")이 씬 안에서 세 변수로 쪼개져 있었다:
//
//   talkingWith   상대 이름·id       endTalk()에서 지워진다
//   talkingProp   호감도가 갈 대상    **한 번도 안 지워진다**
//   chatLog       대화 이력           상대가 바뀌어도 안 갈린다
//
// 그 결과:
//   - 고양이에게 말을 거는데 엄마와 하던 대화가 이력으로 넘어가 엄마가 답했다
//   - 편의점에서 뭘 하든 몇 시간 전 고양이에게 호감도가 붙었다
//
// 쪼갠 것을 각자 관리하면 언젠가 반드시 어긋난다. 하나로 묶는다.
//
// **이력은 상대별로 따로 쌓인다.** 이게 핵심이다 —
// 하나로 쌓으면 A와의 대화가 B의 입력이 되고, 그러면 이 게임이 모으는
// 자료 전체가 오염된다 (누가 무슨 말을 했는지가 섞이므로).

/** 상대가 방금 한 말을 잊지 않을 만큼. 짧으면 "아까 그거"를 못 알아듣는다 */
export const MEMORY = 40;

/** 이력을 담는 서랍의 이름. id가 있으면 id로 — 이름은 표시용이라 바뀔 수 있다 */
export function keyOf(s) {
  return s?.npc ?? s?.name ?? null;
}

/**
 * 대화를 연다. **여기서 상대가 못 박힌다.**
 *
 * 이후 대사 텍스트에서 상대를 다시 읽지 않는다 — writer가 쓴 화자 이름을
 * 믿으면 공원에서 노숙자와 얘기하다 친구가 답하는 일이 실제로 일어났다.
 *
 * @param {{npc?:string|null, name?:string, key?:string}|null} who
 * @param {'prop'|'phone'|'mirror'} kind 어느 AI가 답할지도 이 값이 정한다
 */
export function open(who, kind = 'prop') {
  return {
    npc: who?.npc ?? null,
    name: who?.name ?? '상대',
    kind,
    // 프롭 자체를 들고 있는다. 따로 두면 그게 안 지워지는 변수가 된다
    prop: who && who.key !== undefined ? who : null,
  };
}

/** 그 상대와 지금까지 한 말. 없으면 빈 배열 — 남의 대화가 새어 들어오지 않는다 */
export function logOf(chats, s) {
  const k = keyOf(s);
  return (k && chats?.[k]) ? chats[k] : [];
}

/** 한 줄 쌓는다. 상대의 서랍에만 들어간다 */
export function remember(chats, s, speaker, text) {
  const k = keyOf(s);
  if (!k || !text) return chats ?? {};
  const prev = chats?.[k] ?? [];
  return { ...(chats ?? {}), [k]: [...prev, { speaker, text }].slice(-MEMORY) };
}

/**
 * 호감도가 갈 상대. **대화창이 닫혀 있으면 아무에게도 안 간다.**
 *
 * 이 판단을 부르는 쪽에 맡기면 또 흩어진다. 여기서 한다.
 *
 * 프롭이 아니라 id로 답한다 — 폰으로 주고받는 것도 그 사람과 말한 것이다.
 * 예전엔 프롭에 매여 있어서, 폰으로 지훈에게 답장을 써도 호감도는
 * **마지막으로 다가갔던 아무한테나** 갔다.
 *
 * @param {object|null} s 지금 대화
 * @param {boolean} live 대화창이 열려 있는가
 */
export function creditedTo(s, live) {
  return live && s?.npc ? { npc: s.npc, name: s.name } : null;
}
