// 그 공간에 원래 있는 사람들.
//
// 7/31에 고정 NPC를 한 번 걷어냈다 — "매일 같은 장면이면 관측할 게 없다"는 이유였고
// 그 판단 자체는 맞다. 그런데 그러면서 **NPC의 공급원이 디렉터 하나가 됐다.**
// 배포본 키가 죽은 나흘 동안 세상에 아무도 없었던 게 그 결과다.
//
// 그래서 나누기로 했다:
//
//   여기 누가 사는가        고정 (이 파일)          — 엄마는 거실에 있고 편의점엔 알바생이 있다
//   오늘 무슨 일이 있는가    디렉터 (plan.scenes)   — 그 위에 덧붙는다
//   무슨 말을 하는가         AI (writer)            — 여기에 대사를 쓰지 않는 이유
//
// 이 파일에는 **대사가 없다.** `detail` 한 줄은 다가갔을 때 생성이 끝날 때까지
// 띄워둘 첫 줄일 뿐이고, 대화는 여전히 매번 새로 쓰인다.
// 여기에 대사를 박는 순간 7/31에 걷어낸 그 구조로 돌아간다.

import { DAY_END } from './clock.js';

/** 낮 06:00~18:00. 자정을 넘긴 시각(24:00~)도 제대로 접힌다 */
export function isDaytime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  return h >= 6 && h < 18;
}

/**
 * 같은 날 같은 자리에 들어갔다 나왔다 해도 **같은 사람이 있어야 한다.**
 * Math.random을 쓰면 맵을 나갔다 오는 것만으로 엄마가 생겼다 사라진다.
 * 날짜·공간·인물 이름만으로 정해지는 값을 쓴다.
 */
function roll(day, mapId, who) {
  const s = `${day}/${mapId}/${who}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // **마무리 믹싱이 없으면 편향된다.** FNV만 돌렸을 때 0.55짜리 확률이
  // 60일 중 22일밖에 안 나왔다 — 날짜 한 글자만 다른 짧은 문자열이라
  // 비트가 충분히 섞이지 않는다. murmur3의 finalizer로 흩어준다
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;      // 0 이상 1 미만
}

/**
 * 붙박이 인물들.
 *
 * `npc`는 호감도를 세는 키다(game/affinity.js). `slot`은 그 공간에서 설 자리.
 * 확률은 시간대에 따라 갈린다 — 낮 공원엔 친구가, 밤 공원엔 다른 사람이 있다.
 */
const RESIDENTS = {
  living: [
    {
      npc: 'mom', name: '엄마', look: 'person', slot: 'a',
      chance: () => 0.6,                     // 있을 때도 있고 없을 때도 있다
      detail: '엄마가 소파 끝에 앉아 티비를 보고 있다.',
      request: { key: 'laundry_basket_1', text: '빨래바구니 좀 비워달라고 했다' },
    },
    {
      // 엄마가 없는 날엔 쪽지가 남아 있다. **빈 거실을 만들지 않는다**
      npc: null, name: '엄마가 남긴 쪽지', look: 'object', slot: 'a', fallbackFor: 'mom',
      detail: '식탁 위에 쪽지가 접혀 있다.',
    },
  ],
  store: [
    {
      npc: 'clerk', name: '편의점 알바생', look: 'person', slot: 'a',
      chance: () => 1,                       // 편의점에 사람이 없을 수는 없다
      detail: '알바생이 계산대 안쪽에 서 있다.',
      request: { key: 'shelf_1', text: '선반 정리하는 걸 도와달라고 했다' },
    },
  ],
  park: [
    {
      npc: 'friend', name: '친구', look: 'person', slot: 'a',
      // 낮에는 자주, 밤에는 거의 없다
      chance: (min) => (isDaytime(min) ? 0.75 : 0.1),
      detail: '벤치 쪽에서 낯익은 얼굴이 이쪽을 본다.',
      request: { key: 'chair_1', text: '같이 좀 앉아 있자고 했다' },
    },
    {
      npc: 'homeless', name: '노숙자', look: 'person', slot: 'b',
      // 밤에만. 낮에는 아예 없다
      chance: (min) => (isDaytime(min) ? 0 : 0.55),
      detail: '벤치 끝에 사람이 웅크리고 있다.',
    },
  ],
};

/**
 * 지금 이 공간에 있는 붙박이들.
 *
 * @param {string} mapId
 * @param {number} minutes 게임 내 시각 (자정을 넘겼으면 1440 이상)
 * @param {number} day
 * @returns {Array<{npc:string|null, name:string, look:string, slot:string, detail:string,
 *                  request?:{key:string,text:string}, resident:true}>}
 */
export function residentsAt(mapId, minutes, day) {
  const list = RESIDENTS[mapId] ?? [];
  const out = [];
  const present = new Set();

  for (const r of list) {
    if (r.fallbackFor) continue;                    // 대체물은 아래에서 따로
    if (roll(day, mapId, r.npc ?? r.name) >= r.chance(minutes)) continue;
    present.add(r.npc);
    out.push(pack(r));
  }

  // 없는 사람의 자리를 대신할 것 (엄마 → 쪽지)
  for (const r of list) {
    if (!r.fallbackFor || present.has(r.fallbackFor)) continue;
    if (out.some((o) => o.slot === r.slot)) continue;
    out.push(pack(r));
  }

  return out;
}

function pack(r) {
  return {
    npc: r.npc ?? null,
    name: r.name,
    look: r.look,
    slot: r.slot,
    detail: r.detail,
    request: r.request ?? null,
    resident: true,
    // 디렉터의 프롭과 같은 모양으로 맞춘다 — 씬은 둘을 구분하지 않고 그린다
    target: 'none',
    signal: 'behavior',
  };
}

/** 그 시각이 하루 중 어디쯤인지 한 마디. 프롬프트에 넘겨 대사 톤을 맞춘다 */
export function timeBand(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  if (h >= 6 && h < 11) return '아침';
  if (h >= 11 && h < 18) return '낮';
  if (h >= 18 && h < 23) return '저녁';
  return minutes >= DAY_END ? '자정 넘은 새벽' : '밤';
}
