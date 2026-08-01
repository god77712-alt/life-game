// 게임 내 시계. DESIGN.md §1의 상수를 그대로 구현한다. 순수 모듈 — Phaser를 모른다.

export const GAME_MIN_PER_REAL_SEC = 2;                        // 1 실제초 = 2 게임분
export const MS_PER_GAME_MIN = 1000 / GAME_MIN_PER_REAL_SEC;   // 게임 1분 = 500ms
export const DAY_END = 24 * 60;      // 자정 = 강제 종료
export const DAY1_WAKE = 14 * 60;    // Day 1은 전날이 없으므로 14:00 고정
export const SLEEP_TO_WAKE = 9 * 60; // 기상 = 전날 취침 + 9시간

/**
 * 이 시각 전에는 잠이 오지 않는다.
 * 없으면 Day 1 기상 직후(14:00)에 자버릴 수 있는데, 그러면 기상이 23:00이라
 * 다음 날이 1시간(실제 30초)짜리가 된다. 상수를 고치는 대신 취침 조건으로 막는다.
 */
export const SLEEP_FROM = 20 * 60;   // 20:00

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
   * 다음 날로.
   * @param {number|null} sleepMinutes 잤으면 취침 시각, **자정을 넘겨 안 잤으면 null**.
   *   안 잤으면 시간이 흐르지 않았으므로 00:00부터 하루가 통째로 남는다.
   */
  nextDay(sleepMinutes) {
    this.day += 1;
    this.start(sleepMinutes === null ? 0 : wakeAfter(sleepMinutes));
  }

  /** @returns {boolean} 이 틱에 자정에 도달했는가 */
  advance(deltaMs) {
    if (!this.running) return false;
    this.minutes += deltaMs / MS_PER_GAME_MIN;
    if (this.minutes >= DAY_END) {
      this.minutes = DAY_END;
      this.running = false;
      return true;
    }
    return false;
  }

  stop() {
    this.running = false;
  }

  get label() {
    return fmt(this.minutes);
  }

  /** 하루가 얼마나 지났는가 0~1. 시계 게이지에 쓴다. */
  get progress() {
    const span = DAY_END - this.wake;
    return span > 0 ? Math.min(1, (this.minutes - this.wake) / span) : 1;
  }
}
