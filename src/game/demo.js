// 시연용 고정 대본.
//
// **왜 이게 있나** — 시연 영상은 30~50초 안에 게임의 논리를 한 바퀴 돌아야 한다.
// 실제 판은 며칠이 걸리고, AI가 매번 다른 말을 쓰므로 두 번 찍으면 두 번 다른 영상이 된다.
// 그래서 회피·바람을 **못 박고**, 거기서 역산한 대사를 여기 둔다.
//
//   회피   제대로 시작해본 적이 없어서, 시작 자체를 미루고 두려워한다
//   바람   보기만 해도 행복해지는 사진을 찍는 사람이 되고 싶다
//
// **게임 코드는 이 파일을 모른다.** 대화가 오가는 길(playEvent → speak → 답장)은
// 실제 판과 똑같고, 답장을 쓰는 주체만 API에서 이 표로 바뀐다 (RoomScene.speak의 세 줄).
// 그래야 영상에 찍히는 것이 연출이 아니라 실제 동작이 된다.

// ── 어디까지 온 판인가 ──────────────────────────────────────
//
// **가설이 confirmed까지 갔다는 건 며칠을 산 판이라는 뜻이다.**
// DAY 1에 누적 0인 화면에서 "회피 ★확인됨"이 뜨면 그 자체가 거짓말이고,
// 심사위원은 숫자를 먼저 본다. 그래서 시계와 누적을 그럴듯한 자리에 놓고 시작한다.
//
//   기준선 하루가 16시간 · 게이지 한 칸(DESIGN.md §1)이고, L0~L2를 챙기면 하루 80~110점.
//   엿새를 살면 600점 근처가 된다 — 아래 값은 거기서 왔다.

export const START = {
  day: 7,
  wake: 13 * 60 + 20,     // 엿새째 늦잠. 기상 시각은 전날 취침에서 나오므로 어중간한 게 맞다
  at: 15 * 60 + 10,       // 친구 전화가 오는 시각. 오후여야 "낮에 뭘 하다 받았다"가 된다
  total: 620,
  points: 245,            // 누적보다 적다 — 편의점에서 쓴 만큼 줄어 있어야 한다
  sleepAt: 23 * 60 + 40,  // ②를 누를 때 이 시각으로 옮긴다. 정산창은 밤에 떠야 한다
  // 엿새를 같이 산 사이다. 10(초면)인 채로 "너 예전에 그랬잖아"가 나오면 말이 안 맞는다.
  // **엄마는 100 고정이라 여기 안 쓴다** (affinity.js PINNED)
  affinity: { friend: 52, clerk: 24 },
};

// ── 컷 1. 폰이 울린다 — 친구 ────────────────────────────────
//
// 첫 대사 안에 **회피와 바람이 같이 들어 있다** — "카메라는 샀는데 안 뜯었다".
// 이 한 줄이 영상 전체가 서는 자리다.

export const PHONE = {
  event: {
    id: 'demo_call', at: '15:10', kind: 'dialogue', target: 'none',
    signal_wanted: ['language', 'reaction'],
  },
  script: {
    lines: [
      { speaker: '친구', text: '야 살아있냐' },
      { speaker: '친구', text: '나 오늘 사진 동아리 첫 모임 갔다 왔는데' },
      { speaker: '친구', text: '너 예전에 카메라 산다고 노래 부르던 거 생각나서' },
    ],
    choices: [
      { id: 'c1', text: '샀어. 아직 상자에 있어', reads_as: '시작하지 않은 것을 스스로 말함' },
      { id: 'c2', text: '...', reads_as: '회피 — 응답 자체를 흘림' },
      { id: 'c3', text: '잘됐네', reads_as: '관계 수용, 자기 얘기는 없음' },
    ],
    free_input: false,
  },
};

/**
 * 친구의 답장. 플레이어가 고른 말에 이어 붙는다.
 *
 * **어느 선택지를 골라도 같은 자리로 흘러간다.** 시연이라 그렇기도 하지만,
 * 실제로도 사람은 회피 한 번에 물러나지 않는다 — 다르게 물어볼 뿐이다.
 */
export const FRIEND_TURNS = [
  {
    lines: [
      { speaker: '친구', text: 'ㅋㅋㅋ진짜 아직도?' },
      { speaker: '친구', text: '그거 산 지 반년 됐잖아' },
      { speaker: '친구', text: '왜 안 뜯었어' },
    ],
    choices: [
      { id: 'd1', text: '잘 못 찍을 것 같아서', reads_as: '회피의 핵심 — 실패 예상이 시작을 막는다' },
      { id: 'd2', text: '그냥', reads_as: '이유를 대지 않음' },
      { id: 'd3', text: '귀찮아서', reads_as: '회피를 다른 이름으로 부름' },
    ],
  },
  {
    lines: [
      { speaker: '친구', text: '야 사진을 처음부터 잘 찍는 사람이 어딨어' },
      { speaker: '친구', text: '오늘 동아리 형이 찍은 거 봤는데 그냥 골목 사진이야' },
      { speaker: '친구', text: '근데 보는데 기분이 좋아지더라. 너도 그런 거 찍고 싶다 했잖아' },
    ],
    choices: [
      { id: 'e1', text: '보기만 해도 행복해지는 사진', reads_as: '바람을 자기 말로 다시 꺼냄' },
      { id: 'e2', text: '기억력 좋네', reads_as: '인정하되 비껴감' },
      { id: 'e3', text: '(그만 얘기한다)', reads_as: '대화를 닫음', end: true },
    ],
  },
  {
    lines: [
      { speaker: '친구', text: '어 그거. 그 말 그대로 했었어 너' },
      { speaker: '친구', text: '언제 한 번 들고 나와라. 같이 찍자' },
    ],
    choices: [
      { id: 'f1', text: '생각해볼게', reads_as: '거절도 수락도 아님' },
      { id: 'f2', text: '(그만 얘기한다)', reads_as: '대화를 닫음', end: true },
    ],
  },
];

// ── 컷 2. 가설 테이블 ───────────────────────────────────────
//
// 정산창 아래에 뜬다(game/table.js settleLines). **AI가 읽어낸 것을 눈으로 보여주는 유일한 자리**라
// 영상에 반드시 한 컷 들어가야 한다 (CLAUDE.md — 가설 테이블 뷰는 필수).

export const TABLE = {
  act: 3,
  confirm: { layers: ['language', 'reaction', 'behavior'], verifications: 2, needsOpening: 1 },
  avoidance: {
    pattern: '시작을 요구하는 일 앞에서만 말이 짧아진다',
    evidence: ['카메라를 반년째 뜯지 않음', '동아리 얘기에 화제를 돌림'],
  },
  hypotheses: [
    {
      id: 'h_avoid',
      axis: 'avoid',
      who: '나',
      // **정산창 한 줄은 44칸이다** (table.js WIDTH). 넘으면 '…'로 잘리고,
      // 영상에서 가장 중요한 두 줄이 잘린 채 찍힌다 — 길이를 맞춰 쓴다
      label: '시작해본 적이 없어서 시작을 미룬다',
      status: 'confirmed',
      confidence: 0.78,
      verified_count: 2,
      opened_to_who: 1,
      signals: [{ kind: 'language' }, { kind: 'reaction' }, { kind: 'behavior' }],
    },
    {
      id: 'h_want',
      axis: 'want',
      who: '나',
      label: '보기만 해도 행복해지는 사진을 찍는다',
      status: 'confirmed',
      confidence: 0.71,
      verified_count: 2,
      opened_to_who: 1,
      signals: [{ kind: 'language' }, { kind: 'reaction' }, { kind: 'behavior' }],
    },
  ],
};

export const MIRROR_CAST = {
  name: '카메라를 목에 건 사람',
  // 정산창 44칸에서 이름까지 쓰고 남는 자리가 13칸뿐이다 — 길면 '…'로 잘린다
  carries: '시작을 못 함',
};

// ── 컷 3. 골 맵 — 바람을 실제로 해보는 무대 ─────────────────
//
// 회피가 확정되면 거울 인물이 서고, 바람이 확정되면 그걸 **해볼 수 있는 자리**가 열린다.
// 그래서 골 맵은 사진을 찍는 곳이어야 한다 — 해질녘 옥상.

export const GOAL = {
  label: '해질녘 옥상, 난간 너머로 골목이 다 보이는 자리',
  theme: 'street',
  arrive: '빛이 십 분쯤 남았다. 난간에 팔을 얹으면 골목이 통째로 들어온다.',
  reason: '바람(사진)을 실제로 해볼 수 있는 자리. 잘 찍을 필요가 없는 곳이라 시작의 문턱이 가장 낮다',
  objects: [
    { type: 'shelf', position: 'top-center', size: 'large', cleanable: false },
    { type: 'plant', position: 'mid-left', size: 'medium', cleanable: false },
    { type: 'chair', position: 'bottom-left', size: 'medium', cleanable: false },
    { type: 'box', position: 'bottom-right', size: 'medium', cleanable: false },
    { type: 'table', position: 'mid-right', size: 'medium', cleanable: false },
    { type: 'bottle', position: 'center', size: 'small', cleanable: false },
    { type: 'lamp', position: 'top-right', size: 'small', cleanable: false },
  ],
  mirror: {
    name: '카메라를 목에 건 사람',
    look: 'person',
    detail: '목에 건 카메라에 아직 스트랩 태그가 붙어 있다.',
    opening: '여기 빛 좋다고 해서 왔는데, 와서는 그냥 서 있네.',
    speech: [
      '한 문장이 짧다. 열 자에서 스무 자 사이.',
      '자기 얘기를 하려다 뒤를 흐린다.',
    ].join('\n'),
    stuck: '시작하는 일. 못 할까 봐 아예 안 한다.',
    wants: '자기 손으로 한 장 찍는 것.',
  },
};

/**
 * 거울과의 네 턴. **마지막 줄이 이 게임의 한 방이다** —
 * 플레이어가 남에게 해준 말이 그대로 인용되어 돌아온다.
 *
 * 마지막 턴에 `ending: true`가 붙으면 붕괴가 예약된다 (RoomScene.afterMirror).
 */
export const MIRROR_TURNS = [
  {
    lines: [
      { speaker: '카메라를 목에 건 사람', text: '이거 산 지 반년 됐는데' },
      { speaker: '카메라를 목에 건 사람', text: '아직 한 장도 못 찍었어' },
    ],
    choices: [
      { id: 'm1', text: '왜?', reads_as: '남의 사정을 묻는다' },
      { id: 'm2', text: '지금 여기 예쁜데', reads_as: '지금 하라고 민다' },
      { id: 'm3', text: '...', reads_as: '응답을 흘림' },
    ],
  },
  {
    lines: [
      { speaker: '카메라를 목에 건 사람', text: '잘 못 찍을까 봐' },
      { speaker: '카메라를 목에 건 사람', text: '못 찍을 거면 안 찍은 게 낫잖아. 아직 아무것도 아니니까' },
    ],
    choices: [
      { id: 'n1', text: '못 찍어도 찍은 건 남잖아', reads_as: '자기 회피에 대한 답을 남에게 해준다' },
      { id: 'n2', text: '한 장만 찍어봐', reads_as: '반걸음을 권한다' },
      { id: 'n3', text: '나도 그래', reads_as: '자기 얘기를 꺼냄' },
    ],
  },
  // **여기가 응원이 나오는 자리다.** 회피의 이유를 그가 스스로 말하고,
  // 플레이어가 그 말에 답한다 — 남에게 해주는 말이라 쉽게 나오지만,
  // 같은 회피를 가진 사람이 하는 말이므로 결국 자기가 자기한테 하는 말이 된다
  {
    lines: [
      { speaker: '카메라를 목에 건 사람', text: '완벽한 사진을 찍고 싶어' },
      { speaker: '카메라를 목에 건 사람', text: '그러다 보니 아무것도 못 찍고 있는 것 같아…' },
    ],
    choices: [
      { id: 'p1', text: '일단 찍어보는 게 중요한 거 아닐까?', reads_as: '자기 회피에 대한 답을 스스로 말한다' },
      { id: 'p2', text: '완벽한 게 뭔데?', reads_as: '기준 자체를 되묻는다' },
      { id: 'p3', text: '나도 딱 그래', reads_as: '자기 얘기를 꺼낸다' },
    ],
  },
  {
    lines: [
      { speaker: '카메라를 목에 건 사람', text: '…그런가' },
      { speaker: '카메라를 목에 건 사람', text: '(찰칵)' },
      { speaker: '카메라를 목에 건 사람', text: '야 이거 봐봐. 완전 흔들렸어ㅋㅋ' },
      // **플레이어가 방금 한 말을 그대로 인용한다.** 게임의 마지막 한 방이고,
      // 여기서 3초 멈춰야 관객이 "저건 자기가 자기한테 한 말"임을 알아챈다
      { speaker: '카메라를 목에 건 사람', text: '근데 네가 그랬잖아. 일단 찍어보는 게 중요하다고' },
    ],
    choices: [
      { id: 'o1', text: '찍었네', reads_as: '자기 말이 자기에게 돌아온 것을 받는다' },
    ],
    ending: true,
  },
];

/** 현실 전환에서 요구하는 것. **바람과 이어져야 마지막이 붙는다** */
export const REALITY_CLAIM = '지금, 한 장 찍기';

// ── 대본 재생기 ─────────────────────────────────────────────
//
// 씬은 이 객체 하나만 들고 있다가, 답장을 만들 차례에 next()를 부른다.
// 없으면 null이 나오고 씬은 평소대로 API로 간다 — **켜지 않으면 아무것도 안 바뀐다.**

export class DemoScript {
  constructor() {
    this.friend = 0;
    this.mirror = 0;
  }

  /** 친구의 다음 답장. 다 떨어지면 null */
  nextFriend() {
    return FRIEND_TURNS[this.friend++] ?? null;
  }

  /** 거울의 다음 턴. 다 떨어지면 마지막 턴을 다시 준다 — 대화가 열린 채 굳지 않게 */
  nextMirror() {
    return MIRROR_TURNS[this.mirror++] ?? MIRROR_TURNS[MIRROR_TURNS.length - 1];
  }
}
