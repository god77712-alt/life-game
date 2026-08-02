// 저장 / 이어하기.
//
// **이 게임에는 정해진 마지막 날이 없다.** 가설이 confirmed에 닿을 때까지 산다 —
// 빠르면 며칠, 늦으면 그보다 한참. 며칠이 걸릴지는 설계값이 아니라 이벤트 품질의 결과다.
// 그러니 새로고침 한 번에 날아가면 아무도 끝까지 못 간다.
//
// **로그인은 두지 않았다.** 계정을 만들면 서버에 사람 정보가 쌓이는데,
// 이 게임이 모으는 건 그 사람이 무엇을 피하고 무엇을 말했는지다.
// 그걸 서버에 이름 붙여 보관할 이유가 없다 —
// 기기에만 두고, 옮기고 싶으면 본인이 코드로 들고 간다.
//
// 방 사진은 저장하지 않는다. 인식 결과(오브젝트 목록)만 남는다.

import { hypoLabel, ranked } from './table.js';

const KEY = 'life-game/save/v1';

/** 이 판을 이어가는 데 필요한 것만. 화면·스프라이트 같은 건 다시 만들면 된다. */
export function snapshot(scene) {
  return {
    v: 1,
    at: Date.now(),
    day: scene.clock.day,
    minutes: scene.clock.minutes,
    wake: scene.clock.wake,
    total: scene.total,
    // 방은 사진에서 왔을 수 있다. 인식 결과만 남긴다 — 사진은 애초에 저장 안 한다
    room: scene.custom ? { label: scene.custom.label, vision: scene.custom.vision } : null,
    roomIndex: scene.roomIndex,
    survey: scene.survey ?? null,
    world: scene.world ?? null,
    cast: scene.cast ?? [],
    table: scene.table ?? null,
    history: scene.history ?? [],
    plan: scene.plan ?? null,
    goal: scene.goal ?? null,
    // 엔딩 상태 — 여기가 빠지면 붕괴 다음 날 현실 인증이 안 뜬다
    collapsed: !!scene.collapsed,
    collapseNext: !!scene.collapseNext,
    collapsedOn: scene.collapsedOn ?? null,
    realityDone: !!scene.realityDone,
    mirrorTurn: scene.mirrorTurn ?? 0,
    mirrorLog: scene.mirrorLog ?? [],
    // **원문은 통째로 들고 간다.** 요약하면 말투가 사라지고, 말투가 사라지면
    // 거울이 그 사람을 안 닮는다 (CLAUDE.md)
    told: scene.observer?.told ?? [],
    sleptLastNight: scene.sleptLastNight !== false,
    // 관계는 하루로 초기화되지 않는다. 이름도 같이 — 숫자만 남으면 누구였는지 모른다
    // 포인트와 가방은 날짜를 넘어 남는다 — 오늘 산 사료를 내일 줄 수 있어야 한다
    points: scene.points ?? 0,
    bag: scene.bag ?? {},
    affinity: scene.affinity ?? null,
    npcNames: Object.fromEntries(scene.npcNames ?? []),
  };
}

export function save(scene) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(scene)));
    return true;
  } catch (e) {
    // 용량 초과·사생활 모드 등. 저장 실패가 게임을 막지는 않는다
    console.warn('[save]', e.message);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.v === 1 ? s : null;      // 형식이 바뀌면 조용히 새 게임
  } catch {
    return null;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* 지울 게 없으면 그만 */ }
}

export const has = () => !!load();

/** 이어하기 화면에 띄울 한 줄. */
export function describe(s = load()) {
  if (!s) return null;
  const day = new Date(s.at);
  const when = `${day.getMonth() + 1}/${day.getDate()} ${String(day.getHours()).padStart(2, '0')}:${String(day.getMinutes()).padStart(2, '0')}`;
  // 확정된 것이 있으면 그것부터. 이름은 정산창과 같은 함수로 만든다 —
  // 여기가 옛 필드(`desire`)를 읽고 있어서 이어하기 줄에 undefined가 떴었다
  const top = ranked(s.table)[0];
  return {
    when,
    day: s.day,
    total: s.total,
    collapsed: s.collapsed,
    opened: (s.told ?? []).filter((t) => t.self).length,
    hypothesis: top ? `${hypoLabel(top)} (${(top.confidence ?? 0).toFixed(2)})` : null,
  };
}

// ── 기기 옮기기 ──────────────────────────────────────────────
//
// 로그인 대신. 저장을 문자열 하나로 만들어 본인이 들고 간다.
// 서버를 거치지 않으므로 아무 데도 기록이 안 남는다.

/** 저장 → 붙여넣기 가능한 코드. 한글이 들어가므로 UTF-8을 거쳐 base64로. */
export function exportCode(s = load()) {
  if (!s) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 코드 → 저장. 형식이 아니면 null을 주고 기존 저장을 건드리지 않는다. */
export function importCode(code) {
  try {
    const bin = atob(String(code ?? '').trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const s = JSON.parse(new TextDecoder().decode(bytes));
    if (s?.v !== 1) return null;
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  } catch {
    return null;
  }
}
