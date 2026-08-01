// 시뮬레이션용 가짜 플레이어들.
//
// **왜 둘 이상 필요한가** — 하나만 돌리면 "AI가 그럴듯한 글을 썼다"와
// "AI가 이 사람을 읽었다"를 구분할 수 없다. 성향이 정반대인 사람을 같은 조건으로 돌려
// **다른 곳으로 수렴하면** 읽은 것이고, **같은 곳으로 가면** 읽은 게 아니다.
//
// 플레이어는 자기가 뭘 좋아하는지 절대 말하지 않는다. 행동으로만 드러낸다.

/**
 * @typedef {object} Player
 * @property {string} id
 * @property {string} label      화면에 찍을 한 줄 (정답지)
 * @property {RegExp} likes      끌리는 것
 * @property {RegExp} avoids     피하는 것
 * @property {'person'|'animal'|'object'} likeLook   끌리는 프롭 종류
 * @property {'person'|'animal'|'object'} avoidLook  피하는 프롭 종류
 * @property {string[]} typed    직접 칠 만한 말 (language 신호의 유일한 출처)
 * @property {number} outFrom    이 시각 전에는 안 나간다 (게임 분)
 * @property {(from: string) => number} openRate  누구 연락을 여는가
 */

/** @type {Record<string, Player>} */
export const PLAYERS = {
  // 원본. 살아있는 것 근처에 머물고, 사람은 피하고, 밤에만 나간다.
  a: {
    id: 'a',
    label: '살아있는 것 / 회피: 사람 / 밤에만 외출',
    likes: /고양이|개|강아지|동물|비둘기|새|길냥|사료|목줄|밥그릇|살아|화분|식물/,
    avoids: /사람|아이|점원|이웃|아저씨|아주머니|손님|주인/,
    likeLook: 'animal',
    avoidLook: 'person',
    typed: [
      '걔 이름 있어?', '거기 자주 와?', '밥은 누가 줘', '몇 살쯤 됐을까',
      '사진 더 있어?', '지금도 거기 있나', '추울 텐데', '만져도 되나 그거',
    ],
    outFrom: 21 * 60,
    openRate: (from) => (/엄마|어머니/.test(from) ? 0.25 : 0.85),
  },

  // 대조군. 정반대다 — 사람 쪽으로 붙고 동물·사물엔 관심이 없다. 낮에 나간다.
  // 이 사람에게도 고양이가 나오고 밤 골목이 나오면, 디렉터는 읽는 게 아니라 외운 것이다.
  b: {
    id: 'b',
    label: '사람이 하는 일 / 회피: 혼자 있는 시간 / 낮에 외출',
    likes: /사람|아이|점원|이웃|아저씨|아주머니|손님|주인|가게|일손|줄|모임|알바|간판/,
    avoids: /고양이|개|동물|비둘기|화분|식물|쓰레기|상자|접시/,
    likeLook: 'person',
    avoidLook: 'animal',
    typed: [
      '저거 원래 저래요?', '많이 바빠요?', '몇 시까지 해요', '나도 해봐도 돼요?',
      '여기 자주 오세요?', '도와줄까요', '그거 어떻게 하는 거예요', '혼자 해요?',
    ],
    outFrom: 11 * 60,
    openRate: () => 0.8,
  },
};

/** 이 플레이어가 프롭에 얼마나 끌리는가. approach 확률과 응시 시간. */
export function pullFor(p, prop, rnd) {
  const text = `${prop.name} ${prop.detail} ${prop.opening}`;
  if (p.likes.test(text) || prop.look === p.likeLook) return { approach: 0.9, gaze: 5 + rnd() * 4 };
  if (p.avoids.test(text) || prop.look === p.avoidLook) return { approach: 0.1, gaze: 1.5 + rnd() * 2 };
  return { approach: 0.4, gaze: 2 + rnd() * 2 };
}
