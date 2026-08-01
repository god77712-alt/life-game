// 시작 설문.
//
// 원칙 1 — **의도가 보이면 안 된다.**
//   "밖에 나갈 일이 있다면" 은 "너는 안 나간다"를 전제로 깐 질문이다.
//   전제가 보이는 순간 플레이어는 방어적으로 답하고, 시작 전부터 낙인이 찍힌다.
//   누구나 답할 수 있는 일상 질문으로 묻고, **답이 신호가 되게** 한다.
//
// 원칙 2 — **무엇에 끌리는지는 끝까지 묻지 않는다.**
//   묻는 것은 언제 / 어디를 지나는가 / 어디로 말이 닿는가, 그리고 주의가 향하는 방향.
//   그게 사실인지는 행동이 정한다 (DESIGN.md §5).

export const SURVEY = [
  {
    key: 'gender',
    text: '성별을 물어도 될까.',
    options: [{ value: '남' }, { value: '여' }, { value: '응답 안 함', label: '말하고 싶지 않다' }],
  },
  {
    key: 'age_band',
    text: '지금 몇 살쯤 되었나.',
    options: [
      { value: '10대' }, { value: '20대' }, { value: '30대' }, { value: '40대 이상' },
      { value: '응답 안 함', label: '말하고 싶지 않다' },
    ],
  },
  {
    key: 'doing',
    text: '요즘 뭐 하고 지내.',
    options: [
      { value: '학교', label: '학교 다닌다' },
      { value: '일', label: '일한다' },
      { value: '쉬는 중', label: '좀 쉬고 있다' },
      { value: '그냥', label: '그냥 그렇다' },
    ],
  },

  // ── 아래 넷은 접근 조건과 기질. 전부 일상 질문의 얼굴을 하고 있다 ──

  {
    // → awake_window. "언제 깨어 있나"가 아니라 "언제가 편한가"로 묻는다
    key: 'calm_time',
    text: '하루 중 제일 마음이 편한 시간은.',
    options: [
      { value: '아침', label: '아침 일찍' },
      { value: '낮', label: '한낮' },
      { value: '저녁', label: '해 질 무렵' },
      { value: '밤', label: '깊은 밤' },
      { value: '없음', label: '딱히 없다' },
    ],
  },
  {
    // → outside_route. "나가느냐"가 아니라 "어디를 지나느냐"로 묻는다
    key: 'nearby',
    text: '집 근처에서 제일 자주 지나는 곳은.',
    options: [
      { value: '편의점' },
      { value: '공원·산책로' },
      { value: '지하철역·정류장' },
      { value: '없음', label: '딱히 없다' },
    ],
  },
  {
    // → channel. "연락을 보느냐"가 아니라 알림 설정이라는 사소한 습관으로 묻는다
    key: 'notifications',
    text: '휴대폰 알림은.',
    options: [
      { value: '다 켜둠', label: '다 켜둔다' },
      { value: '몇 개만', label: '몇 개만 켜둔다' },
      { value: '다 꺼둠', label: '다 꺼놨다' },
      { value: '모름', label: '건드린 적 없다' },
    ],
  },
  {
    // → 고립의 질감. 혼자 있는 시간을 어떻게 채우는가
    key: 'alone_sound',
    text: '혼자 있을 때 소리는.',
    options: [
      { value: '없음', label: '아무것도 안 틀어둔다' },
      { value: '음악' },
      { value: '영상', label: '영상이나 방송' },
      { value: '사람 말소리', label: '사람 말소리가 있어야 한다' },
    ],
  },
  {
    // → 주의가 향하는 방향. 무엇을 좋아하는지는 묻지 않는다.
    //   "과정"을 고르는 사람과 "웃긴 것"을 고르는 사람은 건드릴 자리가 다르다
    key: 'watch_through',
    text: '영상 볼 때 끝까지 보는 건.',
    options: [
      { value: '만드는 과정', label: '뭔가 만드는 과정' },
      { value: '웃긴 것', label: '웃긴 것' },
      { value: '설명', label: '누가 설명해주는 것' },
      { value: '틀어놓음', label: '그냥 틀어놓는 편' },
    ],
  },

  {
    // 마지막 질문이 이 설문의 본체다.
    // 나이를 고르는 질문이 아니라 투사다. 실제 나이와의 간극 자체가 신호가 된다.
    key: 'play_age',
    text: '몇 살의 나로 살아볼까.',
    pause: 900,                     // 이 질문 앞에서 한 박자 쉰다
    options: [
      { value: 19 }, { value: 26 }, { value: 34 }, { value: 41 },
      { numeric: true, min: 14, max: 79, initial: 30, label: '직접 입력' },
    ],
  },
];

/** 응답이 다 찼는지. 하나라도 비면 캐스팅을 부르지 않는다. */
export const isComplete = (answers) => SURVEY.every((q) => answers[q.key] !== undefined);
