import { normalizeObject } from '../room/schema.js';
import { buildRoom } from '../room/mapper.js';

// 방 밖의 고정 맵들.
//
// 방(`room`)만 사진에서 생성되고, 나머지는 손으로 쓴 레이아웃이다.
// **같은 vision JSON 형식**이라 `buildRoom()`을 그대로 통과한다 — 매퍼가 하나면 된다.
//
// 검증(validateVision)은 거치지 않는다. 손으로 쓴 데이터는 이미 맞고,
// 검증을 거치면 문이 하나로 합쳐져(singleton) 두 방향으로 못 나간다.
//
// 4개로 시작하되 늘려도 된다. `MAPS`에 한 항목 + exits 연결이면 끝.
//
// 구조:  내 방 ─ 거실 ─(현관문)─ 골목 ┬ 편의점
//                                    └ 공원
// 집에서 밖으로 나가는 길은 거실 아래 문 하나뿐이다. 잠기지 않는다 — 언제든 나갈 수 있다.

/** 방 밖 공간에 처음 도착하면 L2 +30. 하루 1회 (DESIGN.md §2) */
const L2 = { tier: 'L2', score: 30 };

// indoor: 집 안이라 창문에 좌우된다. 밖과 편의점은 항상 밝다.
//
// slots: **무언가 놓일 수 있는 빈 자리.** 여기에 누가/무엇이 있는지는 디렉터가 매일 정한다.
//   공원 slot 4개 → 오늘은 우는 아이, 내일은 비둘기 떼, 모레는 비 와서 아무도 없음.
//   사람과 사물을 여기 박아두면 매일 같은 장면이 되고, 관측할 게 사라진다.
export const MAPS = {
  // ── 집 안 ────────────────────────────────────────────────
  living: {
    label: '거실',
    indoor: true,
    theme: 'indoor',
    ...L2,
    arrive: '거실은 티비 소리만 있다.',
    // 거실 아래쪽 문이 현관문이다. 집에서 밖으로 나가는 길은 이것 하나 — 언제든 열린다.
    exits: { 'top-wall': 'room', 'bottom-wall': 'street' },
    // 무언가 놓일 수 있는 자리. **누가/무엇이 있는지는 디렉터가 매일 정한다.**
    // 여기에 사람을 박아두면 매일 같은 장면이 되고, 관측할 게 사라진다.
    slots: [{ id: 'a', x: 9, y: 6 }, { id: 'b', x: 3, y: 6 }],
    vision: {
      room_shape: 'rect',
      messiness: 0.2,
      objects: [
        { type: 'door', position: 'top-wall', size: 'medium', cleanable: false },
        { type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false },
        { type: 'tv', position: 'top-center', size: 'large', cleanable: false },
        { type: 'table', position: 'center', size: 'large', cleanable: false },
        { type: 'chair', position: 'mid-left', size: 'medium', cleanable: false },
        { type: 'chair', position: 'mid-right', size: 'medium', cleanable: false },
        { type: 'shelf', position: 'top-left', size: 'large', cleanable: false },
        { type: 'plant', position: 'top-right', size: 'small', cleanable: false },
        { type: 'lamp', position: 'bottom-left', size: 'small', cleanable: false },
        // 현관에 있던 것들. 나가는 길목에 놓여 있다
        { type: 'box', position: 'bottom-right', size: 'small', cleanable: true },
        { type: 'laundry_basket', position: 'mid-left', size: 'small', cleanable: true },
        // 부엌 쪽. 점수는 없고 **볼 것**이다 — 오늘 냉장고에 뭐가 있나, 싱크대는 어떤가
        { type: 'fridge', position: 'top-right', size: 'medium', cleanable: false },
        { type: 'sink', position: 'mid-right', size: 'medium', cleanable: false },
        { type: 'clock', position: 'right-wall', size: 'small', cleanable: false },
        { type: 'photo', position: 'left-wall', size: 'small', cleanable: false },
      ],
    },
  },

  // ── 집 밖 ────────────────────────────────────────────────
  street: {
    label: '골목',
    theme: 'street',
    ...L2,
    arrive: '바깥 공기가 생각보다 차다.',
    exits: { 'top-wall': 'living', 'left-wall': 'store', 'right-wall': 'park' },
    slots: [{ id: 'a', x: 3, y: 7 }, { id: 'b', x: 8, y: 3 }, { id: 'c', x: 6, y: 8 }],
    vision: {
      room_shape: 'rect',
      messiness: 0.3,
      objects: [
        { type: 'door', position: 'top-wall', size: 'medium', cleanable: false },
        { type: 'door', position: 'left-wall', size: 'medium', cleanable: false },
        { type: 'door', position: 'right-wall', size: 'medium', cleanable: false },
        { type: 'lamp', position: 'top-center', size: 'small', cleanable: false },
        { type: 'lamp', position: 'bottom-center', size: 'small', cleanable: false },
        { type: 'plant', position: 'mid-left', size: 'small', cleanable: false },
        { type: 'box', position: 'bottom-left', size: 'small', cleanable: false },
        { type: 'trash_pile', position: 'bottom-right', size: 'small', cleanable: false },
      ],
    },
  },

  store: {
    label: '편의점',
    theme: 'store',
    ...L2,
    arrive: '문이 열리는 소리. 점원은 고개를 들지 않는다.',
    exits: { 'right-wall': 'street' },
    slots: [{ id: 'a', x: 9, y: 5 }, { id: 'b', x: 4, y: 7 }, { id: 'c', x: 7, y: 5 }],
    vision: {
      room_shape: 'rect',
      messiness: 0.1,
      objects: [
        { type: 'door', position: 'right-wall', size: 'medium', cleanable: false },
        { type: 'window', position: 'bottom-wall', size: 'large', cleanable: false },
        { type: 'shelf', position: 'top-left', size: 'large', cleanable: false },
        { type: 'shelf', position: 'mid-left', size: 'large', cleanable: false },
        { type: 'shelf', position: 'top-center', size: 'large', cleanable: false },
        { type: 'shelf', position: 'center', size: 'large', cleanable: false },
        { type: 'drawer', position: 'top-right', size: 'large', cleanable: false },
        { type: 'table', position: 'bottom-center', size: 'medium', cleanable: false },
        { type: 'chair', position: 'bottom-left', size: 'medium', cleanable: false },
      ],
    },
  },

  park: {
    label: '공원',
    theme: 'park',
    ...L2,
    arrive: '이 시간에는 아무도 없다.',
    exits: { 'left-wall': 'street' },
    slots: [
      { id: 'a', x: 6, y: 6 }, { id: 'b', x: 8, y: 7 },
      { id: 'c', x: 3, y: 4 }, { id: 'd', x: 5, y: 2 },
    ],
    vision: {
      room_shape: 'rect',
      messiness: 0.2,
      objects: [
        { type: 'door', position: 'left-wall', size: 'medium', cleanable: false },
        { type: 'plant', position: 'top-left', size: 'large', cleanable: false },
        { type: 'plant', position: 'top-right', size: 'large', cleanable: false },
        { type: 'plant', position: 'mid-right', size: 'large', cleanable: false },
        { type: 'chair', position: 'center', size: 'medium', cleanable: false },
        { type: 'chair', position: 'mid-left', size: 'medium', cleanable: false },
        { type: 'lamp', position: 'top-center', size: 'small', cleanable: false },
        { type: 'lamp', position: 'bottom-right', size: 'small', cleanable: false },
        { type: 'rug', position: 'bottom-center', size: 'large', cleanable: false },
      ],
    },
  },
};

/** 방에서 나가는 문은 항상 거실로. 사진 맵은 문이 하나뿐이다. */
export const ROOM_EXIT = 'living';

/** 골 맵의 id. 게임당 하나뿐이고, 가설이 confirmed 되기 전까지는 존재하지 않는다. */
export const GOAL_ID = 'goal';

/**
 * 골 맵을 지도에 붙인다. **가설이 확인됐을 때 딱 한 번.**
 *
 * 골목 아래쪽 벽은 이때까지 비어 있다 — 여기 문이 하나 생기는 것이 곧 Act 3의 시작이다.
 * 없던 길이 열리는 게 아니라, **줄곧 있었는데 이제야 보이는 것**에 가깝게 두려고
 * 골목(가장 익숙한 밖)에 붙였다.
 *
 * @param {object} goal `goal-map` AI의 출력
 * @returns {boolean} 붙였는가 (이미 있으면 false)
 */
export function registerGoalMap(goal) {
  if (!goal || MAPS[GOAL_ID]) return false;

  // 손으로 쓴 맵과 달리 **골 맵은 모델이 만든다.** 벽 물건을 바닥에, 바닥 물건을 벽에
  // 놓는 일이 실제로 있었으므로(shelf → right-wall) 오브젝트 단위 교정을 거친다.
  const objects = (goal.objects ?? [])
    .filter((o) => o.type !== 'door')
    .map((o) => normalizeObject(o, []))
    .filter(Boolean);
  // 문은 top-wall 하나만 인정한다. 여러 개면 길을 잃는다
  objects.unshift({ type: 'door', position: 'top-wall', size: 'medium', cleanable: false });

  const vision = { room_shape: 'rect', messiness: 0.2, objects };

  MAPS[GOAL_ID] = {
    label: goal.label ?? '그 곳',
    theme: goal.theme ?? 'street',
    tier: 'L4',
    score: 80,                          // 골 맵 도달 = L4 (DESIGN.md §2)
    arrive: goal.arrive ?? '',
    reason: goal.reason ?? '',
    exits: { 'top-wall': 'street' },
    // 거울 하나만 선다. 여기서 다른 걸 볼 이유가 없다
    slots: [{ id: 'a', ...mirrorSpot(vision) }],
    mirror: goal.mirror ?? null,
    vision,
  };
  MAPS.street.exits['bottom-wall'] = GOAL_ID;
  MAPS.street.vision.objects.push({ type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false });
  return true;
}

/**
 * 거울이 설 자리를 찾는다.
 *
 * 다른 맵은 레이아웃이 고정이라 좌표를 손으로 박아뒀지만, **골 맵은 매번 새로 지어진다** —
 * 좌표를 박으면 어떤 날은 가구 위에, 어떤 날은 플레이어 시작 칸에 겹친다(실제로 겹쳤다).
 *
 * 조건 세 가지: 비어 있을 것 / 시작 칸이 아닐 것 / 사방 중 두 칸 이상 열려 있을 것.
 * 마지막 조건이 없으면 거울이 통로를 막아 플레이어가 갇힌다.
 */
function mirrorSpot(vision) {
  const b = buildRoom(vision);
  const free = (x, y) => b.collision[y]?.[x] === 0;
  const open = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => free(x + dx, y + dy)).length;

  let best = null;
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 10; x++) {
      if (!free(x, y)) continue;
      if (x === b.spawn.x && y === b.spawn.y) continue;      // 플레이어가 서는 칸
      if (open(x, y) < 2) continue;                          // 막다른 칸 — 놓으면 길이 끊긴다
      // 가운데에 가까울수록 좋다. 구석에 세워두면 못 보고 지나친다
      const d = Math.abs(x - 5.5) + Math.abs(y - 4.5);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: b.spawn.x, y: b.spawn.y };
}

/** 새 게임. 골 맵은 게임마다 새로 지어진다. */
export function clearGoalMap() {
  if (!MAPS[GOAL_ID]) return;
  delete MAPS[GOAL_ID];
  delete MAPS.street.exits['bottom-wall'];
  MAPS.street.vision.objects = MAPS.street.vision.objects
    .filter((o) => !(o.type === 'door' && o.position === 'bottom-wall'));
}

/** a에서 b로 갈 때, b에서 돌아오는 문이 어느 벽인가. 도착 스폰을 그 앞에 둔다. */
export function returnWall(fromId, toId) {
  const exits = MAPS[toId]?.exits ?? {};
  const wall = Object.keys(exits).find((w) => exits[w] === fromId);
  return wall ?? null;
}

export const mapList = () => Object.keys(MAPS);
