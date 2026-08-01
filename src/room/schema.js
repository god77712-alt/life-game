// 비전 결과(prompts/room-vision.md 스키마)의 enum과 검증.
// LLM 출력은 신뢰하지 않는다. 여기를 통과한 것만 매퍼로 넘어간다.

export const GRID_W = 12;
export const GRID_H = 10;

export const TYPES = new Set([
  // 가구
  'bed', 'desk', 'chair', 'wardrobe', 'shelf', 'drawer', 'table',
  // 기기
  'monitor', 'pc', 'tv', 'console', 'fan', 'aircon',
  // 벽/개구부
  'window', 'door', 'curtain',
  // 바닥
  'rug', 'clothes_pile', 'trash_pile', 'box', 'laundry_basket',
  // 소품
  'cup', 'bottle', 'book_stack', 'plant', 'poster', 'mirror', 'lamp', 'phone',
  // 살림 — 점수는 없지만 **볼 게 있는 것들.** 무엇을 보고 무엇을 지나쳤나가 곧 신호다
  'fridge', 'sink', 'photo', 'clock', 'calendar',
]);

// 반드시 벽에 붙는 type
export const WALL_TYPES = new Set(['window', 'door', 'poster', 'mirror', 'aircon', 'curtain', 'clock', 'calendar', 'photo']);

export const WALL_POSITIONS = new Set(['top-wall', 'bottom-wall', 'left-wall', 'right-wall']);

export const FLOOR_POSITIONS = new Set([
  'top-left', 'top-center', 'top-right',
  'mid-left', 'center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

export const SIZES = new Set(['small', 'medium', 'large']);

// cleanable 기본값 (프롬프트가 틀리게 줘도 여기로 교정)
export const CLEANABLE_TYPES = new Set([
  'clothes_pile', 'trash_pile', 'laundry_basket', 'cup', 'bottle', 'box', 'book_stack',
]);

const SIZE_RANK = { large: 3, medium: 2, small: 1 };
// 볼 것이 많아야 관측 신호가 많다. large는 따로 4개로 묶여 있어 바닥이 덮이진 않는다.
export const MAX_OBJECTS = 14;

// 벽 type이 바닥 position을 받았을 때 붙일 벽
const TYPE_DEFAULT_WALL = {
  door: 'bottom-wall',
  window: 'top-wall',
  curtain: 'top-wall',
  aircon: 'top-wall',
  poster: 'left-wall',
  mirror: 'right-wall',
};

// 바닥 type이 *-wall을 받았을 때 떨어뜨릴 존
const WALL_TO_ZONE = {
  'top-wall': 'top-center',
  'bottom-wall': 'bottom-center',
  'left-wall': 'mid-left',
  'right-wall': 'mid-right',
};

// 사진 인식 실패 시 폴백. 게임 진행은 절대 막지 않는다.
export const DEFAULT_ROOM = {
  room_shape: 'rect',
  objects: [
    { type: 'bed', position: 'top-left', size: 'large', cleanable: false },
    { type: 'desk', position: 'mid-right', size: 'medium', cleanable: false },
    { type: 'chair', position: 'center', size: 'medium', cleanable: false },
    { type: 'monitor', position: 'mid-right', size: 'medium', cleanable: false },
    { type: 'clothes_pile', position: 'bottom-center', size: 'small', cleanable: true },
    { type: 'trash_pile', position: 'mid-left', size: 'small', cleanable: true },
    { type: 'cup', position: 'bottom-left', size: 'small', cleanable: true },
    { type: 'window', position: 'top-wall', size: 'medium', cleanable: false },
    { type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false },
  ],
  messiness: 0.6,
};

/**
 * 비전 JSON을 게임이 쓸 수 있는 형태로 교정한다.
 * 못 고치는 객체는 조용히 드롭하고 dropped에 사유만 남긴다(디버그 뷰용).
 *
 * @param {unknown} raw
 * @returns {{ room: object, dropped: Array<{raw: unknown, reason: string}>, fellBack: boolean }}
 */
export function validateVision(raw) {
  const dropped = [];
  const src = raw && typeof raw === 'object' ? raw : {};

  const roomShape = src.room_shape === 'l_shape' ? 'l_shape' : 'rect';

  const messiness = clamp01(
    typeof src.messiness === 'number' && Number.isFinite(src.messiness) ? src.messiness : 0.5
  );

  const list = Array.isArray(src.objects) ? src.objects : [];
  let objects = [];

  for (const item of list) {
    const o = normalizeOne(item, dropped);
    if (o) objects.push(o);
  }

  // 인식된 게 사실상 없으면 통째로 폴백 (어두운 사진 / 방이 아닌 사진)
  const fellBack = objects.length < 2;
  if (fellBack) {
    return { room: structuredClone(DEFAULT_ROOM), dropped, fellBack: true };
  }

  objects = dedupe(objects, dropped);
  objects = capLarge(objects);
  objects = ensureEssentials(objects);
  objects = capCount(objects, dropped);

  return { room: { room_shape: roomShape, objects, messiness }, dropped, fellBack: false };
}

export const normalizeObject = normalizeOne;

function normalizeOne(item, dropped) {
  if (!item || typeof item !== 'object') {
    dropped.push({ raw: item, reason: 'not-an-object' });
    return null;
  }

  const type = String(item.type ?? '').trim().toLowerCase();
  if (!TYPES.has(type)) {
    dropped.push({ raw: item, reason: `unknown-type:${type || '(empty)'}` });
    return null;
  }

  const size = SIZES.has(item.size) ? item.size : 'medium';
  let position = String(item.position ?? '').trim().toLowerCase();

  const onWall = WALL_TYPES.has(type);
  if (onWall && !WALL_POSITIONS.has(position)) {
    position = TYPE_DEFAULT_WALL[type] ?? 'top-wall';
  } else if (!onWall && WALL_POSITIONS.has(position)) {
    position = WALL_TO_ZONE[position];
  } else if (!onWall && !FLOOR_POSITIONS.has(position)) {
    position = 'center';
  }

  return { type, position, size, cleanable: CLEANABLE_TYPES.has(type) };
}

// 필수 오브젝트는 절단 대상에서 제외한다
const ESSENTIAL = new Set(['bed', 'door', 'window', 'phone']);

// bed/door/window는 게임 진행 필수. 없으면 만들어 넣는다.
// window가 빠지면 L1 "창문 열기"가 사라지고 밝기 피드백(ART.md §4)이 통째로 죽는다.
// 사진에 안 찍혔을 뿐 실제 방에는 대개 있다.
function ensureEssentials(objects) {
  const out = objects.slice();
  if (!out.some((o) => o.type === 'bed')) {
    out.unshift({ type: 'bed', position: 'top-left', size: 'large', cleanable: false });
  }
  if (!out.some((o) => o.type === 'window' || o.type === 'curtain')) {
    out.push({ type: 'window', position: 'top-wall', size: 'medium', cleanable: false });
  }
  if (!out.some((o) => o.type === 'door')) {
    out.push({ type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false });
  }
  // 폰이 없으면 방 안에서 연락을 받을 통로가 사라진다 (L1 채널)
  if (!out.some((o) => o.type === 'phone')) {
    out.push({ type: 'phone', position: 'mid-left', size: 'small', cleanable: false });
  }
  return out;
}

// bed/door/window처럼 하나뿐이어야 하는 것의 중복 제거
const SINGLETON_TYPES = new Set(['bed', 'door', 'wardrobe', 'aircon']);

function dedupe(objects, dropped) {
  const seenSingleton = new Set();
  const seenExact = new Set();
  const out = [];

  for (const o of objects) {
    if (SINGLETON_TYPES.has(o.type)) {
      if (seenSingleton.has(o.type)) {
        dropped.push({ raw: o, reason: `duplicate-singleton:${o.type}` });
        continue;
      }
      seenSingleton.add(o.type);
    } else if (!o.cleanable) {
      // 어질러진 것은 개수가 점수 기회다 — 중복 허용. 가구는 같은 칸 중복만 제거.
      const key = `${o.type}@${o.position}`;
      if (seenExact.has(key)) {
        dropped.push({ raw: o, reason: `duplicate:${key}` });
        continue;
      }
      seenExact.add(key);
    }
    out.push(o);
  }
  return out;
}

const MAX_LARGE = 4;

/**
 * large(3×2)가 많으면 바닥이 가구로 덮여 통로가 실처럼 남는다.
 * 개수를 자르는 대신 medium으로 강등한다 — 방을 알아보는 데는 있는 게 낫다.
 */
function capLarge(objects) {
  let seen = 0;
  return objects.map((o) => {
    if (o.size !== 'large') return o;
    seen += 1;
    return seen <= MAX_LARGE ? o : { ...o, size: 'medium', demoted: true };
  });
}

// 초과분은 size 큰 순으로 절단. 필수 오브젝트는 무조건 생존.
function capCount(objects, dropped) {
  if (objects.length <= MAX_OBJECTS) return objects;

  const keep = new Set();
  objects.forEach((o, i) => {
    if (ESSENTIAL.has(o.type)) keep.add(i);
  });

  const rest = objects
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => !keep.has(i))
    .sort((a, b) => SIZE_RANK[b.o.size] - SIZE_RANK[a.o.size] || a.i - b.i);

  for (const { i } of rest) {
    if (keep.size >= MAX_OBJECTS) break;
    keep.add(i);
  }

  const out = [];
  objects.forEach((o, i) => {
    if (keep.has(i)) out.push(o);
    else dropped.push({ raw: o, reason: 'over-limit' });
  });
  return out;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
