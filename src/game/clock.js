// 게임 내 시계. DESIGN.md §1의 상수를 그대로 구현한다. 순수 모듈 — Phaser를 모른다.

export const GAME_MIN_PER_REAL_SEC = 2;                        // 1 실제초 = 2 게임분
export const MS_PER_GAME_MIN = 1000 / GAME_MIN_PER_REAL_SEC;   // 게임 1분 = 500ms
export const DAY_END = 24 * 60;      // 하루의 길이. 자정을 넘으면 25:00이 아니라 다음 날 01:00으로 읽는다
export const DAY1_WAKE = 14 * 60;    // Day 1은 전날이 없으므로 14:00 고정
export const SLEEP_TO_WAKE = 9 * 60; // 기상 = 전날 취침 + 9시간

/**
 * **하루는 침대에서 잘 때만 끝난다.**
 *
 * 예전에는 자정이 강제 종료였다. 그러면 안 자고 버틴 날도 정산이 돌아서
 * "자는 것"과 "안 자는 것"의 차이가 흐려졌다 — 이제 자정은 그냥 지나가는 시각이고,
 * 시계는 24:00을 넘어 계속 흐른다(표시는 01:00, 02:00…).
 *
 * 안 자면 점수도 안 쌓이고 정산도 안 돌아 다음 날 이벤트가 안 생긴다.
 * 벌이 아니라 **자야 할 이유**다 (DESIGN.md §1).
 */
export const SLEEP_ANYTIME = true;

/** 기준선 하루(23:00 취침 → 08:00 기상 → 16시간). 게이지 한 칸의 길이 */
export const AWAKE_SPAN = 16 * 60;

export const fmt = (minutes) => {
  const m = Math.floor(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** 그 시각에 자면 다음 날 몇 시에 깨는가. 자정(1440) 강제 종료도 같은 식으로 계산된다. */
export const wakeAfter = (sleepMinutes) => (sleepMinutes + SLEEP_TO_WAKE) % DAY_END;

/** 그 시각에 일어나면 하루가 실제로 몇 초인가 (자정까지) */
export const dayRealSeconds = (wakeMinutes) => ((DAY_END - wakeMinutes) * MS_PER_GAME_MIN) / 1000;

export class Clock {
  constructor(wakeMinutes = DAY1_WAKE) {
    this.day = 1;
    this.start(wakeMinutes);
  }

  start(wakeMinutes) {
    this.wake = wakeMinutes;
    this.minutes = wakeMinutes;
    this.running = true;
  }

  /**
   * 다음 날로. **침대에서 잤을 때만 불린다.**
   * @param {number} sleepMinutes 취침 시각 (자정을 넘겨 잤으면 1440보다 클 수 있다)
   */
  nextDay(sleepMinutes) {
    this.day += 1;
    this.start(wakeAfter(sleepMinutes));
  }

  /**
   * 시간이 흐른다. **멈추는 지점이 없다** — 하루는 잘 때만 끝난다.
   * 자정을 넘으면 minutes가 1440을 넘어가고, 표시만 01:00으로 돌아간다.
   * @returns {boolean} 이 틱에 자정을 막 넘었는가 (연출용. 하루를 끝내지 않는다)
   */
  advance(deltaMs) {
    if (!this.running) return false;
    const before = this.minutes;
    this.minutes += deltaMs / MS_PER_GAME_MIN;
    return before < DAY_END && this.minutes >= DAY_END;
  }

  /** 자정을 넘겨 아직 안 잤는가 */
  get pastMidnight() {
    return this.minutes >= DAY_END;
  }

  stop() {
    this.running = false;
  }

  get label() {
    return fmt(this.minutes);
  }

  /**
   * 깨어난 지 얼마나 됐는가 0~1. 시계 게이지에 쓴다.
   * 자정이 더 이상 끝이 아니므로 **깨어 있는 16시간**을 한 칸으로 본다 —
   * 다 차면 붉어지고, 넘겨도 게이지는 그대로 꽉 찬 채 시간만 간다.
   */
  get progress() {
    return Math.min(1, (this.minutes - this.wake) / AWAKE_SPAN);
  }

  /** 깨어난 뒤 흐른 게임 시간(분) */
  get awakeMinutes() {
    return this.minutes - this.wake;
  }
}
