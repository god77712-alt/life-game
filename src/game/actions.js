// 상호작용 카탈로그. 키는 하나뿐이고, 무엇을 바라보고 있느냐가 행동을 정한다.
// 점수는 DESIGN.md §2 거리 차등표를 그대로 따른다.

import { LOOKABLE } from './ambient.js';

export const TIER_SCORE = { L0: 10, L1: 15, L2: 30, L3: 50, L4: 80 };

// 화면에 띄우는 사물 이름. 행동이 없는 것도 이름은 보여준다.
export const NAMES = {
  bed: '침대', desk: '책상', chair: '의자', wardrobe: '옷장',
  shelf: '선반', drawer: '서랍장', table: '탁자',
  monitor: '모니터', pc: '컴퓨터', tv: 'TV', console: '게임기',
  fan: '선풍기', aircon: '에어컨',
  window: '창문', door: '현관문', curtain: '커튼',
  rug: '러그', clothes_pile: '옷더미', trash_pile: '쓰레기',
  box: '상자', laundry_basket: '빨래통',
  cup: '컵', bottle: '페트병', book_stack: '책더미',
  plant: '화분', poster: '포스터', mirror: '거울', lamp: '스탠드',
  phone: '휴대폰',
  fridge: '냉장고', sink: '싱크대', photo: '사진', clock: '시계', calendar: '달력',
};

// label = 정산·로그용 전체 표현, short = 화면 프롬프트용
const CATALOG = {
  // L0 몸
  bed: { verb: 'make_bed', label: '이불 개기', short: '이불 개기', tier: 'L0' },

  // L1 방
  curtain: { verb: 'open_curtain', label: '커튼 걷기', short: '걷기', tier: 'L1' },
  window: { verb: 'open_window', label: '창문 열기', short: '열기', tier: 'L1' },
  trash_pile: { verb: 'clean', label: '쓰레기 치우기', short: '치우기', tier: 'L1' },
  clothes_pile: { verb: 'clean', label: '옷 정리하기', short: '정리하기', tier: 'L1' },
  laundry_basket: { verb: 'clean', label: '빨래 넣기', short: '넣기', tier: 'L1' },
  book_stack: { verb: 'clean', label: '책 정리하기', short: '정리하기', tier: 'L1' },
  box: { verb: 'clean', label: '상자 치우기', short: '치우기', tier: 'L1' },
  cup: { verb: 'clean', label: '컵 치우기', short: '치우기', tier: 'L1' },
  bottle: { verb: 'clean', label: '병 치우기', short: '치우기', tier: 'L1' },

  // 이동 — 점수는 문이 아니라 **도착한 공간**에 붙는다 (maps.js).
  // 문 자체에 점수를 주면 왔다 갔다 하며 긁을 수 있다.
  door: { verb: 'go_out', label: '나가기', short: '나가기', tier: null },
};

export const nameOf = (obj) => (obj ? NAMES[obj.type] ?? obj.type : '');

/**
 * 오브젝트 하나에 대응하는 행동. 없으면 null.
 * 하루 1회 규칙은 오브젝트 id 단위 — 쓰레기 더미가 3개면 기회도 3번이다.
 *
 * 침대만 예외적으로 상태를 본다. 키가 하나뿐이므로 "무엇을 보느냐"에
 * "그게 어떤 상태냐"를 더해 두 행동을 가른다.
 *   헝클어진 이불 → 이불 개기 (L0 +10)
 *   개어진 이불   → 자기 (하루 종료, 점수 없음)
 */
export function actionFor(obj) {
  if (!obj) return null;

  if (obj.type === 'bed' && obj.variant === 'made') {
    return { key: `sleep:${obj.id}`, verb: 'sleep', label: '자기', short: '자기', tier: null, score: 0 };
  }

  const entry = CATALOG[obj.type];
  if (entry) {
    return {
      key: obj.id,
      verb: entry.verb,
      label: entry.label,
      short: entry.short,
      tier: entry.tier,
      score: entry.tier ? TIER_SCORE[entry.tier] : 0,
    };
  }

  // 점수 행동이 없는 것은 **보는 것**이 행동이다. 점수는 0.
  // 굳이 볼 이유가 없는데 봤다는 사실 자체가 신호다 (ambient.js 참고).
  if (LOOKABLE.has(obj.type)) {
    return { key: `look:${obj.id}`, verb: 'look', label: '보기', short: '보기', tier: null, score: 0 };
  }
  return null;
}

/** 화면에 띄울 한 줄. 행동이 없으면 이름만. */
export function promptLine(obj, done) {
  const name = nameOf(obj);
  const a = actionFor(obj);
  if (!a) return name;
  // 보기는 점수 행동이 아니다. '오늘 완료'라고 쓰면 해치워야 할 일처럼 보인다.
  if (a.verb === 'look') return done ? `${name}   ✓ 봤다` : `${name}   [Space] 보기`;
  if (done) return `${name}   ✓ 오늘 완료`;
  if (!a.score) return `${name}   [Space] ${a.short}`;
  return `${name}   [Space] ${a.short} +${a.score}`;
}

/** 이 방에서 오늘 얻을 수 있는 점수의 상한. 정산창과 디버그 뷰에 쓴다. */
export function potentialScore(objects) {
  return objects.reduce((sum, o) => sum + (actionFor(o)?.score ?? 0), 0);
}
