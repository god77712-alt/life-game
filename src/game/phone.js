// 휴대폰 — 연락이 도착하는 곳.
//
// **왜 이게 필요한가.**
// 지금까지 이벤트는 시각이 되면 말풍선이 그냥 떴다. 그러면 플레이어는
// **읽을지 말지를 고를 수가 없다.** 그런데 이 게임이 재려는 신호가 정확히 그거다 —
// 누구 연락은 바로 열고, 누구 건 며칠씩 안 여는가.
//
// 폰으로 오면 그 선택이 생긴다:
//   울린다 → 안 본다 (그 자체가 자료)
//   울린다 → 몇 시간 뒤에 연다 (delay_min이 곧 reaction 신호)
//   울린다 → 바로 연다
//
// 안 연 연락은 쌓인다. 쌓인 채로 하루가 끝나면 그것도 기록된다.
// 순수 모듈 — Phaser도 시계도 모른다. 시각은 문자열로 받는다.

export class Phone {
  constructor() {
    this.reset();
  }

  reset() {
    this.inbox = [];      // 도착한 것들. 읽은 것도 남는다
    this.seq = 0;
  }

  /**
   * 연락이 도착했다. **열지는 않는다.**
   * @param {object} item schedule의 한 건 (event + script)
   * @param {string} at   게임 내 시각
   * @param {number} minutes 도착 시각(분) — 지연 계산용
   */
  arrive(item, at, minutes) {
    this.seq += 1;
    const from = item.script?.lines?.[0]?.speaker ?? '알 수 없음';
    this.inbox.push({
      id: item.id ?? `m${this.seq}`,
      from,
      // 미리보기는 첫 줄의 앞부분만. **전문을 보여주면 열 이유가 없어진다**
      preview: preview(item.script?.lines?.[0]?.text),
      at,
      atMinutes: minutes,
      opened: false,
      openedAt: null,
      delayMin: null,
      item,
    });
    return this.inbox[this.inbox.length - 1];
  }

  /** 아직 안 읽은 것. 폰 라벨과 알림 표시에 쓴다. */
  get unread() {
    return this.inbox.filter((m) => !m.opened);
  }

  /** 다음에 열릴 것. 오래된 것부터 — 쌓이면 위에서부터 밀린다. */
  next() {
    return this.unread[0] ?? null;
  }

  /**
   * 열었다. **여기서 지연이 확정된다** — 이게 reaction 신호의 유일한 출처다.
   * @returns {object|null} 열린 메시지
   */
  open(id, at, minutes) {
    const m = this.inbox.find((x) => x.id === id && !x.opened);
    if (!m) return null;
    m.opened = true;
    m.openedAt = at;
    m.delayMin = Math.max(0, Math.round(minutes - m.atMinutes));
    return m;
  }

  /** 하루가 끝났다. 안 연 것은 안 연 채로 기록된다 — 그게 답이다. */
  summary() {
    return this.inbox.map((m) => ({
      id: m.id,
      from: m.from,
      at: m.at,
      opened_at: m.openedAt,
      delay_min: m.delayMin,      // null이면 끝내 안 열었다
    }));
  }
}

/** 미리보기 한 줄. 길면 자른다 — 다 보이면 열 이유가 없다. */
function preview(text, max = 14) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '…';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
