// 디렉터가 편성한 이벤트를 게임 내 시각에 맞춰 꺼낸다. 순수 모듈 — Phaser를 모른다.
//
// 이벤트는 거절 가능하고 무벌점이므로(DESIGN.md §4), 시간 안에 못 꺼낸 이벤트는
// 그냥 버린다. 밀어서 다음 날로 넘기지 않는다 — 그러면 편성이 쌓여 시끄러워진다.

/** "10:30" → 630. 형식이 이상하면 null. */
export function parseAt(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export class Schedule {
  /**
   * @param {Array<{event: object, script: object}>} entries  /api/settle의 scripts
   * @param {number} wakeMinutes  기상 시각. 그보다 이른 편성은 기상 직후로 당긴다
   */
  constructor(entries = [], wakeMinutes = 0) {
    this.items = entries
      .map((e, i) => {
        const at = parseAt(e.event?.at);
        return {
          id: e.event?.id ?? `e${i}`,
          at: at === null ? null : Math.max(at, wakeMinutes),
          event: e.event,
          script: e.script,
          played: false,
        };
      })
      .filter((it) => it.at !== null && it.script?.lines?.length)
      .sort((a, b) => a.at - b.at);
  }

  /** 지금 꺼낼 이벤트 하나. 없으면 null. 시각이 지났으면 늦게라도 꺼낸다. */
  due(minutes) {
    return this.items.find((it) => !it.played && minutes >= it.at) ?? null;
  }

  markPlayed(id) {
    const it = this.items.find((x) => x.id === id);
    if (it) it.played = true;
  }

  get pending() {
    return this.items.filter((it) => !it.played);
  }

  get played() {
    return this.items.filter((it) => it.played);
  }

  /** 다음 정산에 넘길 이력. 반복 편성을 막는 데 쓴다. */
  toHistory(day) {
    return this.played.map((it) => ({ day, kind: it.event.kind, beat: it.event.beat }));
  }
}
