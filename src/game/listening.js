// 대화를 **들었는가**, 그리고 **자기 얘기를 했는가**.
//
// 이 게임의 최종 목표는 취향을 알아내는 게 아니라
// **이 사람이 누군가에게 자기 이야기를 하게 만드는 것**이다.
// 그러려면 그게 일어났는지를 코드가 셀 수 있어야 한다. 못 세면 검증도 없다.
//
// 여기 있는 건 **세는 일**뿐이다. 해석은 analyst가 한다 —
// 코드가 셀 수 있는 것만 코드가 세야 AI가 지어낼 여지가 없다.

// ── 1. 참여도 ────────────────────────────────────────────────
//
// 대사를 스킵하고 첫 선택지를 누른 것과, 다 읽고 한참 망설이다 고른 것은
// 로그에 똑같이 "c2를 골랐다"로 남았다. 그 둘은 완전히 다른 일이다.
//
// **스킵은 두 가지를 뜻한다.**
//   그 대화 내용은 자료가 아니다 (referee에게는 no_data)
//   그런데 "스킵했다"는 사실 자체는 자료다 (reaction 신호)
// 엄마 대화는 전부 스킵하고 지훈 대화는 끝까지 읽었다면,
// 그게 이 게임에서 얻을 수 있는 가장 정직한 신호다.

/** 참여도를 한 대화 동안 모은다. Dialogue가 이걸 들고 다닌다. */
export class Attention {
  constructor(speaker = null) {
    this.speaker = speaker;
    this.lines = 0;          // 나온 줄 수
    this.skipped = 0;        // 타자 중에 키를 눌러 건너뛴 줄
    this.moves = 0;          // 선택지에서 ↑↓ 누른 횟수. 0이면 기본값 그대로
    this.typed = false;      // 직접 쳤는가
    this.abandoned = false;  // 고르지 않고 닫았는가
    this.choiceMs = null;    // 선택지가 뜨고 고를 때까지
    this.openedAt = Date.now();
    this.choiceShownAt = null;
  }

  line() { this.lines += 1; }
  skip() { this.skipped += 1; }
  move() { this.moves += 1; }
  choicesShown() { this.choiceShownAt = Date.now(); }

  chose() {
    if (this.choiceShownAt) this.choiceMs = Date.now() - this.choiceShownAt;
  }

  /**
   * 분석에 넘길 형태. **판단하지 않는다** — '무성의했다'가 아니라 숫자만.
   *
   * `read`는 읽은 비율이다. 1.0이면 한 줄도 안 건너뛴 것.
   * 스킵은 키를 빨리 눌러야 생기므로, 이 값이 낮다는 건 실제로 넘겼다는 뜻이다.
   */
  summary() {
    return {
      speaker: this.speaker,
      lines: this.lines,
      read: this.lines ? Math.round((1 - this.skipped / this.lines) * 100) / 100 : null,
      skipped: this.skipped,
      choice_sec: this.choiceMs === null ? null : Math.round(this.choiceMs / 100) / 10,
      moved: this.moves,          // 0 = 첫 선택지를 그냥 눌렀다
      typed: this.typed,
      abandoned: this.abandoned,
      total_sec: Math.round((Date.now() - this.openedAt) / 100) / 10,
    };
  }
}

// ── 2. 자기 개방 ─────────────────────────────────────────────
//
// 플레이어가 직접 친 문장에서 **자기 얘기를 했는가**를 센다.
// 선택지는 남이 써준 말이라 세지 않는다 — 고르는 것과 말하는 것은 다르다.

// **한국어는 주어를 생략한다.** "미루고 있었어요"에는 '나'가 없지만 자기 얘기다.
// 그래서 1인칭을 필수로 두면 대부분을 놓친다. 표식을 여러 종류 두고 **둘 이상**일 때 센다.

/** 1인칭. 조사가 붙으므로 경계를 느슨하게 본다. */
const FIRST_PERSON = /(^|[\s,."'(])(나|내|저|제)([는은가도만의랑와한테])/;

/** 자기 얘기를 꺼낼 때 앞에 붙는 말들. 주어가 없어도 이게 있으면 자기 시점이다. */
const SELF_MARKER = /(요즘|요새|예전|그때|원래|사실|솔직히|어차피|맨날|계속|아직도|한동안|어릴|옛날)/;

/** 감정·상태. '그냥'처럼 너무 흔한 말은 뺐다 — 표식이 아니라 습관이다. */
const STATE = /(힘들|무섭|싫|귀찮|외롭|불안|괜찮|지쳤|못하겠|모르겠|안 되|안돼|하기 싫|어렵|답답|미안|부끄|창피|막막)/;

/** 겪은 일. 한국어 자기 개방은 대개 이 꼴로 온다 — 주어 없이 과거형으로. */
const EXPERIENCE = /(적 있|적은 있|본 적|해봤|해 봤|했었|였었|그랬|미루|안 나가|못 나가|안 하게|못 하게|그만뒀|관뒀|접었)/;

/** 질문 — 이건 자기 개방이 아니라 상대에게 던진 것이다 */
const QUESTION = /[?？]\s*$|(나요|까요|어요\?|는데요\?|해요\?)\s*$/;

/** 자기 얘기로 세려면 표식이 이만큼 필요하다. 하나뿐이면 우연일 수 있다. */
const MIN_MARKS = 2;

/**
 * 한 문장이 자기 개방인가. **점수가 아니라 표식이다.**
 *
 * 왜 정규식인가 — 이 판정을 AI에게 맡기면 "자기 개방이 있었다"를 지어낼 수 있고,
 * 그러면 최종 목표 달성 여부 자체가 모델의 기분이 된다. 세는 건 코드가 한다.
 * 놓치는 건 괜찮다(analyst가 원문을 그대로 보니까). **없는 걸 만들지만 않으면 된다.**
 *
 * @param {string} text 플레이어가 **직접 친** 문장
 * @param {number} [baseline] 이 사람이 평소 쓰는 문장 길이
 */
export function discloses(text, baseline = 0) {
  const s = String(text ?? '').trim();
  if (!s) return null;

  const marks = [];
  if (FIRST_PERSON.test(s)) marks.push('1인칭');
  if (SELF_MARKER.test(s)) marks.push('자기 시점 표지');
  if (STATE.test(s)) marks.push('상태 서술');
  if (EXPERIENCE.test(s)) marks.push('겪은 일');
  // 평소의 두 배 넘게 길어졌다 — 할 말이 있었다는 뜻
  if (baseline > 0 && s.length >= baseline * 2 && s.length >= 20) marks.push('평소보다 김');

  const asking = QUESTION.test(s);

  return {
    text: s,                    // **원문 그대로.** 요약하지 않는다
    length: s.length,
    marks,
    asking,                     // 물음표로 끝나면 상대에게 던진 것 — 개방이 아니다
    self: marks.length >= MIN_MARKS && !asking,
  };
}

/**
 * 하루치 자유 입력에서 자기 개방을 뽑는다.
 *
 * @param {Array<{at?: string, text: string, to?: string}>} typed 직접 친 문장들
 * @returns {{count: number, lines: Array, baseline: number}}
 */
export function disclosures(typed = []) {
  const texts = typed.map((t) => String(t.text ?? '').trim()).filter(Boolean);
  if (!texts.length) return { count: 0, lines: [], baseline: 0 };

  // 평소 길이 = 중앙값. 평균은 긴 문장 하나에 끌려간다
  const sorted = texts.map((t) => t.length).sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)];

  const lines = typed
    .map((t) => {
      const d = discloses(t.text, baseline);
      return d && { ...d, at: t.at ?? null, to: t.to ?? null };
    })
    .filter(Boolean);

  return { count: lines.filter((l) => l.self).length, lines, baseline };
}
