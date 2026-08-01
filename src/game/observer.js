// 플레이어가 무엇에 반응했고 무엇을 지나쳤는지 기록한다.
//
// 왜 필요한가 — 지금까지 analyst는 **한 행동**만 봤다.
// 그런데 회피형 플레이어를 읽는 데 가장 강한 증거는 **안 한 것**이다.
//   · 바라봤는데 그냥 지나쳤다        ← 망설임. 가장 직접적인 회피 증거
//   · 같은 공간에 있었는데 다가가지 않았다
//   · 알림이 왔는데 몇 시간 뒤에 열었다  ← 이게 reaction 신호다
//
// AI를 새로 만들 필요는 없다. analyst가 읽을 데이터가 없었을 뿐이다.
// 순수 모듈 — Phaser도 시계도 모른다. 시각은 문자열로 받는다.

const GAZE_MIN_MS = 800;      // 이보다 짧게 스친 건 응시로 치지 않는다

export class Observer {
  constructor() {
    this.reset();
  }

  reset() {
    this.places = [];         // 공간 체류
    this.engaged = [];        // 실제로 한 것
    this.passed = [];         // 바라봤지만 안 한 것
    this.notifications = [];  // 알림 도착 ~ 열람
    this.gaze = null;         // 지금 바라보는 대상
    this.seen = new Map();    // key → 누적 응시 ms
    this.acted = new Set();
    this.here = null;
  }

  // ── 공간 ────────────────────────────────────────────────

  enterPlace(place, at, available = []) {
    this.leavePlace(at);
    this.here = { place, in: at, minutes: 0, available: available.slice(), touched: new Set() };
    this.places.push(this.here);
  }

  /** @param {number} [minutes] 게임 내 체류 분 */
  leavePlace(at, minutes = 0) {
    this.closeGaze();
    if (!this.here) return;
    this.here.out = at;
    this.here.minutes = Math.round(minutes);
    this.here = null;
  }

  // ── 응시 ────────────────────────────────────────────────

  /**
   * 매 프레임 호출. 대상이 바뀌면 이전 응시를 닫는다.
   * @param {{key: string, name: string}|null} target
   */
  look(target, deltaMs) {
    if (!target) return this.closeGaze();
    if (this.gaze?.key !== target.key) {
      this.closeGaze();
      this.gaze = { key: target.key, name: target.name, ms: 0 };
    }
    this.gaze.ms += deltaMs;
  }

  closeGaze() {
    const g = this.gaze;
    this.gaze = null;
    if (!g || g.ms < GAZE_MIN_MS) return;
    this.seen.set(g.key, (this.seen.get(g.key) ?? 0) + g.ms);
  }

  /** 실제로 상호작용했다 */
  act(key, name, at, kind) {
    this.closeGaze();
    this.acted.add(key);
    this.here?.touched.add(key);
    this.engaged.push({
      what: name, place: this.here?.place ?? '?', at, kind,
      gazed_sec: Math.round((this.seen.get(key) ?? 0) / 100) / 10,
    });
  }

  // ── 알림 ────────────────────────────────────────────────

  notify(id, from, at) {
    this.notifications.push({ id, from, at, opened_at: null, delay_min: null });
  }

  open(id, at, delayMinutes) {
    const n = this.notifications.find((x) => x.id === id && !x.opened_at);
    if (!n) return;
    n.opened_at = at;
    n.delay_min = Math.round(delayMinutes);
  }

  // ── 분석 AI에 넘길 형태 ─────────────────────────────────

  /** @param {(key: string) => string} nameOf 키 → 사람이 읽을 이름 */
  summary(nameOf = (k) => k) {
    this.leavePlace(null);

    // 바라봤는데 안 한 것 — 망설임의 흔적
    const passed = [];
    for (const [key, ms] of this.seen) {
      if (this.acted.has(key)) continue;
      passed.push({ what: nameOf(key), gazed_sec: Math.round(ms / 100) / 10 });
    }

    // 같은 공간에 있었는데 아예 다가가지도 않은 것
    const unseen = [];
    for (const p of this.places) {
      for (const key of p.available) {
        if (this.acted.has(key) || this.seen.has(key)) continue;
        unseen.push({ what: nameOf(key), place: p.place });
      }
    }

    return {
      places: this.places.map(({ place, in: i, out, minutes }) => ({ place, in: i, out, minutes })),
      engaged: this.engaged,
      passed: passed.sort((a, b) => b.gazed_sec - a.gazed_sec),
      unseen,
      notifications: this.notifications,
    };
  }
}
