// 편의점에서 사는 것들, 그리고 그걸 누구에게 주는가.
//
// **점수는 깎지 않는다.** 누적 점수는 이 게임의 메시지 그 자체이고
// (붕괴날의 `오늘 +0`이 그 위에서만 성립한다), CLAUDE.md가 "감점 없음"을 상수로 박아뒀다.
// 그래서 쓸 수 있는 건 **행동할 때 점수와 함께 들어오는 포인트**다 —
// 점수는 기록으로 남고 포인트는 잔액으로 줄어든다. 얻은 만큼 쓴다는 감각은 같고,
// 다 써도 누적 점수와 엔딩은 손상되지 않는다.
//
// 사는 것에는 두 쓸모가 있다:
//   먹는다  허기·피로가 찬다 (표시만 — game/vitals.js)
//   준다    누군가에게 건넨다. **이쪽이 본체다** — 호감도가 오르고 퀘스트가 닫힌다

/** 행동 점수 1점 = 포인트 1. 하루 잘 살면 100~150P가 들어온다 */
export const POINT_PER_SCORE = 1;

export const ITEMS = {
  onigiri: {
    label: '삼각김밥', price: 25, icon: '▮',
    eat: { hunger: 35 },
    detail: '유통기한이 오늘까지다.',
  },
  coffee: {
    label: '캔커피', price: 20, icon: '▯',
    eat: { fatigue: 25 },
    detail: '차가운 게 하나 남아 있다.',
  },
  catfood: {
    label: '고양이 사료', price: 40, icon: '◆',
    detail: '작은 봉지. 계산대 옆에 걸려 있다.',
  },
  blanket: {
    label: '담요', price: 60, icon: '▤',
    detail: '얇지만 없는 것보다는 낫다.',
  },
};

export const ORDER = ['onigiri', 'coffee', 'catfood', 'blanket'];

export const itemLabel = (id) => ITEMS[id]?.label ?? id;

/** 지금 살 수 있는가 */
export const canAfford = (points, id) => (ITEMS[id] ? points >= ITEMS[id].price : false);

/**
 * 산다. **부족하면 아무 일도 안 일어난다** — 빚이 생기지 않는다.
 * @returns {{ok:boolean, points:number, bag:object, reason?:string}}
 */
export function buy(points, bag, id) {
  const item = ITEMS[id];
  if (!item) return { ok: false, points, bag, reason: '그런 건 없다' };
  if (points < item.price) return { ok: false, points, bag, reason: '포인트가 모자란다' };
  return {
    ok: true,
    points: points - item.price,
    bag: { ...bag, [id]: (bag?.[id] ?? 0) + 1 },
  };
}

/** 가방에서 하나 뺀다. 없으면 그대로 */
export function take(bag, id) {
  const n = bag?.[id] ?? 0;
  if (n <= 0) return { ok: false, bag };
  const out = { ...bag };
  if (n === 1) delete out[id];
  else out[id] = n - 1;
  return { ok: true, bag: out };
}

export const has = (bag, id) => (bag?.[id] ?? 0) > 0;

export const bagList = (bag) =>
  ORDER.filter((id) => has(bag, id)).map((id) => ({ id, ...ITEMS[id], count: bag[id] }));

/** 가진 것 중 그 사람이 원하는 첫 번째 것 */
export function wantedFrom(bag, wants = []) {
  return wants.find((id) => has(bag, id)) ?? null;
}

/** 상태창에 뜨는 한 줄 */
export const bagLine = (bag) =>
  bagList(bag).map((i) => `${i.label}${i.count > 1 ? `×${i.count}` : ''}`).join(' ') || '가진 것 없음';
