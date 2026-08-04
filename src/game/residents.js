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
// 이 파일에는 **대사도 부탁도 없다.** 부탁을 여기 박으면 엄마는 매일 같은 걸 시키는
// 사람이 되고, 그러면 관측할 게 없다 — 부탁은 디렉터가 만든다 (game/errands.js).
// `detail` 한 줄은 다가갔을 때 생성이 끝날 때까지
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
    },
  ],
  park: [
    {
      npc: 'friend', name: '친구', look: 'person', slot: 'a',
      // 낮에는 자주, 밤에는 거의 없다
      chance: (min) => (isDaytime(min) ? 0.75 : 0.1),
      detail: '벤치 쪽에서 낯익은 얼굴이 이쪽을 본다.',
    },
    {
      npc: 'homeless', name: '노숙자', look: 'person', slot: 'b',
      // 밤에만. 낮에는 아예 없다
      chance: (min) => (isDaytime(min) ? 0 : 0.55),
      detail: '벤치 끝에 사람이 웅크리고 있다.',
      // **주는 것이 곧 퀘스트다.** 대화만으로는 안 열리고, 손에 뭔가 있어야 열린다
      wants: ['blanket', 'onigiri'],
    },
    {
      npc: 'cat_park', name: '공원 고양이', look: 'animal', slot: 'c',
      chance: () => 0.5,
      detail: '수풀 아래에서 이쪽을 본다. 다가가면 물러선다.',
      wants: ['catfood'],
    },
  ],
  street: [
    {
      // **골목의 고양이는 공원 것과 다른 개체다.** 그런데 한동안 둘 다 `npc: 'cat'`이라
      // 호감도 서랍을 같이 썼다 — 공원 고양이에게 사료를 주면 골목 고양이도 같이 올랐다.
      // 날짜 해시만 나누고 id를 안 나눠서 생긴 일이다. 다른 개체면 id도 달라야 한다
      npc: 'cat_alley', name: '골목 고양이', look: 'animal', slot: 'a',
      chance: (min) => (isDaytime(min) ? 0.35 : 0.7),   // 밤에 더 자주 나온다
      detail: '담 밑에서 웅크리고 있다. 며칠은 굶은 것 같다.',
      wants: ['catfood'],
    },
  ],
};

/**
 * **이 게임의 유일한 인물 명단.**
 *
 * 예전엔 씬에도 같은 표가 두 벌 더 있었다(`NPC_IDS`, `NPC_NAME_TO_ID`).
 * 그래서 고양이를 두 마리로 나눌 때 세 군데를 고쳐야 했고, 한 군데를 놓치면
 * 부탁이 조용히 버려지거나 찾아온 사람을 못 알아봤다. 명단은 여기 하나다.
 */
export const ROSTER = Object.values(RESIDENTS)
  .flat()
  .filter((r) => r.npc)
  .map((r) => ({ npc: r.npc, name: r.name, look: r.look }));

/** 부탁을 할 수 있는 사람들. 여기 없는 id로 온 부탁은 버려진다 */
export const NPC_IDS = ROSTER.map((r) => r.npc);

/** 이름으로 호감도 키를 찾는다. 찾아온 사람이 아는 사람인지 알아보는 데 쓴다 */
export function idOfName(name) {
  return ROSTER.find((r) => r.name === name)?.npc ?? null;
}

/** 사람이 아닌 것(동물)인가. 말투·관계 설명이 달라진다 */
export function isAnimal(npc) {
  return ROSTER.find((r) => r.npc === npc)?.look === 'animal';
}

/**
 * 지금 이 공간에 있는 붙박이들.
 *
 * @param {string} mapId
 * @param {number} minutes 게임 내 시각 (자정을 넘겼으면 1440 이상)
 * @param {number} day
 * @returns {Array<{npc:string|null, name:string, look:string, slot:string, detail:string,
 *                  wants?:string[], resident:true}>}
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
    wants: r.wants ?? null,
    resident: true,
    // 디렉터의 프롭과 같은 모양으로 맞춘다 — 씬은 둘을 구분하지 않고 그린다
    target: 'none',
    signal: 'behavior',
  };
}

/**
 * 오늘 그 공간 식탁에 밥이 차려져 있는가.
 *
 * 사람과 같은 규칙으로 정한다 — 날짜 해시라 나갔다 와도 안 바뀐다.
 * **엄마가 있는 날 더 자주 차려져 있다.** 밥은 저절로 생기지 않는다.
 *
 * 부탁이 아니라 그냥 있는 것이다 — 먹어도 호감도는 안 오른다.
 * 안 먹고 지나친 것은 관측에 남는다(passed). 그게 이 게임이 보는 것이다.
 */
export function mealAt(mapId, minutes, day) {
  if (mapId !== 'living') return false;
  const withMom = roll(day, 'living', 'mom') < 0.6;
  const h = Math.floor(minutes / 60) % 24;
  const mealtime = (h >= 7 && h < 10) || (h >= 11 && h < 14) || (h >= 17 && h < 21);
  if (!mealtime) return false;
  return roll(day, 'living', 'meal') < (withMom ? 0.7 : 0.3);
}

/** 그 시각이 하루 중 어디쯤인지 한 마디. 프롬프트에 넘겨 대사 톤을 맞춘다 */
export function timeBand(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  if (h >= 6 && h < 11) return '아침';
  if (h >= 11 && h < 18) return '낮';
  if (h >= 18 && h < 23) return '저녁';
  return minutes >= DAY_END ? '자정 넘은 새벽' : '밤';
}
