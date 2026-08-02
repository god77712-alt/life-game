// 게임 중 NPC 대화 — 하단 고정 박스, 글자 한 자씩 (ART.md §5).
//
// 키는 상호작용 키 하나. 누를 때마다 정확히 한 단계씩만 나아간다.
//   타자 중      → 그 줄을 끝까지 다 보여준다 (건너뛰지 않는다)
//   다 나온 뒤   → 다음 줄. 다음 줄이 없으면 선택지, 선택지도 없으면 대화 종료
//   응답 대기 중 → 아무 일도 없다 (`…`). 도착하면 다음 줄로 이어진다
//
// 원칙: **읽던 글은 어떤 경우에도 화면에서 사라지지 않는다.** 네트워크 응답이 늦게 오든
// 실패하든, 플레이어가 키를 누르기 전까지 박스는 그대로 있는다.

import { GRID_W, GRID_H } from '../room/schema.js';
import { Attention } from '../game/listening.js';
import { TILE, ROOM_TOP } from '../render/textures.js';
import { fitHitArea } from './hitarea.js';

const W = GRID_W * TILE;
const H = ROOM_TOP + GRID_H * TILE;
const FONT = 'monospace';
const TYPE_MS = 28;

/**
 * 뒷말을 얼마나 기다리는가. 넘기면 스스로 빠져나온다.
 * writer 11초 · npc-reply 6초 · mirror 6초가 실측이므로 넉넉하되 무한하지는 않게.
 */
const WAIT_MS = 25000;

const BOX = { x: 6, w: W - 12, h: 92 };
const COLOR = {
  speaker: '#ffd447', text: '#e8dcc0', option: '#7d6f5c',
  selected: '#ffd447', hint: '#5a4f42', free: '#8fa6b8',
};

function bevel(g, x, y, w, h) {
  g.fillStyle(0x14110f, 0.96).fillRect(x, y, w, h)
    .fillStyle(0x5a4f42, 1).fillRect(x, y, w, 1).fillRect(x, y, 1, h)
    .fillStyle(0x0a0806, 1).fillRect(x, y + h - 1, w, 1).fillRect(x + w - 1, y, 1, h);
}

export class Dialogue {
  constructor(scene) {
    this.scene = scene;
    const y = H - BOX.h - 6;
    this.y = y;

    this.box = scene.add.graphics().setDepth(9700).setVisible(false);
    this.speaker = scene.add.text(BOX.x + 8, y + 6, '', {
      fontFamily: FONT, fontSize: '10px', color: COLOR.speaker, resolution: 1,
    }).setDepth(9701).setVisible(false);
    this.body = scene.add.text(BOX.x + 8, y + 22, '', {
      fontFamily: FONT, fontSize: '11px', color: COLOR.text, resolution: 1,
      wordWrap: { width: BOX.w - 16 },
    }).setDepth(9701).setVisible(false);
    this.hint = scene.add.text(BOX.x + BOX.w - 8, y + BOX.h - 14, '', {
      fontFamily: FONT, fontSize: '9px', color: COLOR.hint, resolution: 1,
    }).setOrigin(1, 0).setDepth(9701).setVisible(false);

    this.rows = [];
    this.options = [];
    this.open = false;
  }

  /**
   * @param {{lines: Array<{speaker,text}>, choices: Array, free_input?: boolean}} script
   * @param {(choice: object|null) => void} onDone
   * @param {{pending?: boolean, waitMs?: number, onGiveUp?: () => void}} [opts]
   *   pending이면 마지막 줄에서 닫지 않고 뒷말을 기다린다.
   *   **기다림에는 반드시 시한이 있다** — 없으면 응답이 안 올 때 대화창이 영영 안 닫히고,
   *   대화 중에는 이동도 막히므로 게임이 통째로 멈춘다 (실제로 멈췄다).
   */
  play(script, onDone, opts = {}) {
    // 스킵하고 첫 선택지를 누른 것과 다 읽고 망설이다 고른 것은 완전히 다른 일이다.
    // 로그에는 똑같이 "c2를 골랐다"로만 남았다 — 이제 센다 (listening.js)
    this.attention = new Attention(script?.lines?.[0]?.speaker ?? opts.speaker ?? null);
    this.script = script;
    this.onDone = onDone;
    this.onEnd = null;
    this.queued = null;
    this.pending = !!opts.pending;
    this.waitMs = opts.waitMs ?? WAIT_MS;
    this.onGiveUp = opts.onGiveUp ?? null;
    this.lineIndex = 0;
    this.phase = 'lines';
    this.open = true;

    this.box.clear();
    bevel(this.box, BOX.x, this.y, BOX.w, BOX.h);
    for (const o of [this.box, this.speaker, this.body, this.hint]) o.setVisible(true);

    this.typeLine();
  }

  typeLine() {
    const line = this.script.lines[this.lineIndex];
    this.attention?.line();
    this.speaker.setText(line.speaker ?? '');
    this.full = line.text ?? '';
    this.shown = 0;
    this.body.setText('');
    this.hint.setText('');

    this.timer?.remove();
    this.timer = this.scene.time.addEvent({
      delay: TYPE_MS,
      repeat: Math.max(0, this.full.length - 1),
      callback: () => {
        this.shown += 1;
        this.body.setText(this.full.slice(0, this.shown));
        if (this.shown >= this.full.length) this.lineDone();
      },
    });
    if (!this.full.length) this.lineDone();
  }

  /** 한 줄이 끝났다. 다음에 무엇이 있느냐가 힌트를 정한다. */
  lineDone() {
    this.timer?.remove();
    this.timer = null;

    if (this.lineIndex < this.script.lines.length - 1) { this.hint.setText('▾ [Space]'); return; }
    if (this.queued) { this.hint.setText('▾ [Space]'); return; }   // 뒷말이 벌써 도착해 있다
    if (this.pending) {                                            // 아직 오는 중
      this.phase = 'waiting';
      this.hint.setText('…');
      this.startWaitClock();
      return;
    }
    this.hint.setText('[Space]');
  }

  /**
   * 기다림에 시한을 건다. 시간이 다 되면 **스스로 빠져나온다.**
   *
   * 답이 안 오는 일은 흔하다 — 서버가 느리거나, 끊기거나, 크레딧이 없거나.
   * 그때 대화창이 열린 채로 남으면 이동도 막혀 게임이 죽는다.
   * 그래서 시간이 다 되면 조용히 포기하고 `[Space]`로 닫을 수 있게 돌려준다.
   */
  startWaitClock() {
    this.stopWaitClock();
    this.waitTimer = this.scene.time.delayedCall(this.waitMs, () => {
      this.waitTimer = null;
      if (this.phase !== 'waiting') return;      // 그 사이에 왔다
      const give = this.onGiveUp;
      this.pending = false;
      this.onGiveUp = null;
      // 읽던 글은 그대로 둔다. 힌트만 바꿔 나갈 길을 연다
      this.phase = 'lines';
      this.hint.setText('[Space]');
      if (!this.onEnd) this.onEnd = () => give?.();
    });
  }

  stopWaitClock() {
    this.waitTimer?.remove();
    this.waitTimer = null;
  }

  /** 키 하나로 진행·확정. 게임 본편과 같은 규칙. */
  advance() {
    if (!this.open) return;

    if (this.phase === 'lines') {
      if (this.timer && this.shown < this.full.length) {   // 타자 중 → 이 줄을 끝까지
        this.attention?.skip();                            // 다 나오기 전에 눌렀다
        this.shown = this.full.length;
        this.body.setText(this.full);
        this.lineDone();
        return;
      }
      if (this.queued) {                                   // 기다리던 뒷말로 넘어간다
        this.swapTo(this.queued);
        return;
      }
      if (this.lineIndex < this.script.lines.length - 1) { // 다음 줄
        this.lineIndex += 1;
        this.typeLine();
        return;
      }
      if (this.pending) return;                            // 뒷말이 아직 안 왔다
      if (this.onEnd) {                                    // 이어질 게 없다 → 여기서 끝
        if (this.attention) this.attention.abandoned = this.phase === 'choices';
        this.lastAttention = this.attention?.summary() ?? null;
        const done = this.onEnd;
        this.onEnd = null;
        this.close();
        done?.();
        return;
      }
      this.showChoices();
      return;
    }

    if (this.phase !== 'choices') return;      // waiting·input 중에는 키가 안 먹는다

    const opt = this.options[this.index];
    if (opt?.free) { this.openInput(); return; }

    this.attention?.chose();
    this.lastAttention = this.attention?.summary() ?? null;
    this.close();
    this.onDone?.(opt ?? null);
  }

  move(delta) {
    if (!this.open || this.phase !== 'choices' || !this.rows.length) return;
    this.attention?.move();                    // 0이면 기본값을 그냥 누른 것
    this.index = (this.index + delta + this.rows.length) % this.rows.length;
    this.paint();
  }

  showChoices() {
    const choices = this.script.choices ?? [];
    if (!choices.length) {          // 선택지가 없는 이벤트는 읽고 끝
      this.lastAttention = this.attention?.summary() ?? null;
      this.close();
      this.onDone?.(null);
      return;
    }
    this.phase = 'choices';
    this.index = 0;

    // 선택지 + 마지막 줄은 '직접 말하기'.
    // 정해진 답만 있으면 하고 싶은 말을 할 수가 없다.
    //
    // 단 **사람이 아닌 화면에는 안 붙인다** — 편의점 진열대에 대고 할 말은 없다.
    // `free_input: false`를 준 쪽(가게·안내)만 예외다
    this.options = this.script.free_input === false
      ? [...choices]
      : [...choices, { id: '__free', text: '직접 말하기…', free: true }];

    this.body.setText('');
    this.speaker.setText('');
    this.options.forEach((c, i) => {
      const t = this.scene.add.text(BOX.x + 16, this.y + 10 + i * 15, '', {
        fontFamily: FONT, fontSize: '11px', color: COLOR.option, resolution: 1,
      }).setDepth(9701);
      // 손가락 — 원하는 항목을 직접 누른다.
      // 이게 없으면 폰에서는 첫 번째 선택지밖에 못 고른다.
      // 판정 영역은 글이 들어온 뒤 paint()에서 맞춘다
      t.on('pointerup', () => {
        if (this.phase !== 'choices') return;
        // 다른 항목을 눌렀으면 옮긴 것도 '움직였다'로 센다 (기본값을 그냥 누른 게 아니다)
        if (i !== this.index) { this.attention?.move(); this.index = i; this.paint(); }
        this.advance();
      });
      this.rows.push(t);
    });
    this.hint.setText('↑↓ 이동   [Space] 선택');
    this.attention?.choicesShown();
    this.paint();
  }

  paint() {
    this.options.forEach((c, i) => {
      const on = i === this.index;
      const t = this.rows[i];
      if (!t) return;
      t.setText(`${on ? '▸ ' : '  '}${c.text}`)
        .setColor(on ? COLOR.selected : (c.free ? COLOR.free : COLOR.option));
      // 대화 상자 안쪽을 줄마다 띠로 나눠 갖는다. 높이는 줄 간격(15)까지 —
      // 넘기면 위아래 줄이 겹쳐서 엉뚱한 선택지가 눌린다
      fitHitArea(t, { left: -16, width: BOX.w - 20, height: 15 });
    });
  }

  // ── 자유 입력 ───────────────────────────────────────────

  /** 텍스트 입력 모드. 실제 입력은 HTML input이 받는다 (IME 때문에 canvas로는 무리) */
  openInput() {
    this.attention && (this.attention.typed = true);   // 자기 말을 하려 한다
    this.phase = 'input';
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.speaker.setText('나');
    this.body.setText('');
    this.hint.setText('[Enter] 말하기   [Esc] 취소');
    this.onInputOpen?.();
  }

  /**
   * 입력 중에는 **캔버스에 글자를 그리지 않는다.**
   * 같은 자리에 HTML input이 떠 있어서 두 겹으로 겹쳐 보였다.
   * 조합 중인 한글(ㅎ→하→한)도 input 쪽이 정확하므로 그쪽에 맡긴다.
   */
  setInputText() { /* input이 직접 보여준다 (ui/chatinput.js) */ }

  // ── 뒤늦게 도착하는 말 ──────────────────────────────────

  /**
   * 생성된 대사가 도착했다. **바로 갈아끼우지 않는다** — 쌓아두고 키를 기다린다.
   *
   * 화면의 글이 바뀌는 건 언제나 플레이어가 키를 눌렀을 때뿐이어야 한다.
   * 응답이 언제 오느냐에 따라 읽던 글이 저 혼자 바뀌면 그게 곧 버그로 보인다.
   */
  continueWith(script) {
    if (!this.open) return;
    this.stopWaitClock();
    this.queued = script;
    if (this.phase === 'waiting') {      // `…`로 서 있었다 → 이어갈 수 있다고 알린다
      this.phase = 'lines';
      this.hint.setText('▾ [Space]');
    }
  }

  /** 지금 대사를 새 대사로 갈아끼운다. */
  swapTo(script) {
    this.stopWaitClock();
    this.timer?.remove();
    this.timer = null;
    this.script = script;
    this.lineIndex = 0;
    this.phase = 'lines';
    this.pending = false;
    this.queued = null;
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.typeLine();
  }

  /**
   * 이어질 게 없어졌다 (생성 실패 등). 읽던 줄은 그대로 두고 `[Space]`로 닫게 한다.
   * 갑자기 닫으면 글이 사라진 것처럼 보인다.
   */
  endWith(speaker, text, onClose) {
    if (!this.open) { onClose?.(); return; }
    this.stopWaitClock();
    this.onEnd = onClose;
    this.pending = false;
    this.queued = null;
    if (this.timer) return;              // 아직 읽는 중 — 다 읽으면 lineDone이 [Space]를 띄운다

    if (speaker != null) this.speaker.setText(speaker);
    if (text != null) { this.full = text; this.shown = text.length; this.body.setText(text); }
    this.phase = 'lines';                // waiting에서 풀어준다
    this.hint.setText('[Space]');
  }

  close() {
    this.open = false;
    this.stopWaitClock();
    this.onGiveUp = null;
    this.timer?.remove();
    this.timer = null;
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.options = [];
    this.queued = null;
    this.pending = false;
    this.onEnd = null;
    this.phase = null;
    for (const o of [this.box, this.speaker, this.body, this.hint]) o.setVisible(false);
    this.box.clear();
    this.onInputClose?.();
  }
}
