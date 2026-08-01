// 질문 한 줄 + 선택지. 시작 설문이 지금 쓰고, NPC 대화가 나중에 그대로 쓴다.
// 키는 ↑↓ 로 고르고 Space 로 확정. 게임 본편과 같은 규칙 (ART.md §3-1).

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';

const W = GRID_W * TILE;                 // 384
const H = ROOM_TOP + GRID_H * TILE;      // 352
const FONT = 'monospace';
const TYPE_MS = 34;                      // 한 글자 타자 속도

const COLOR = {
  question: '#e8dcc0',
  option: '#7d6f5c',
  selected: '#ffd447',
  hint: '#4a4238',
};

export class Chooser {
  /**
   * @param {Phaser.Scene} scene
   * @param {{x?: number, top?: number}} [layout]
   */
  constructor(scene, layout = {}) {
    this.scene = scene;
    this.x = layout.x ?? Math.round(W * 0.22);
    this.top = layout.top ?? Math.round(H * 0.34);

    this.question = scene.add.text(this.x, this.top, '', {
      fontFamily: FONT, fontSize: '12px', color: COLOR.question, resolution: 1,
    }).setDepth(100);

    this.rows = [];
    this.hint = scene.add.text(W - 8, H - 16, '', {
      fontFamily: FONT, fontSize: '9px', color: COLOR.hint, resolution: 1,
    }).setOrigin(1, 0).setDepth(100);

    this.typing = null;
    this.active = false;
  }

  /**
   * @param {{text: string, options: Array}} q
   * @param {(value: any) => void} onPick
   */
  ask(q, onPick) {
    this.clearRows();
    this.onPick = onPick;
    this.options = q.options;
    this.index = 0;
    this.active = false;
    this.hint.setText('');

    // 질문을 한 글자씩. Space를 누르면 즉시 완성된다.
    // fadeOut이 내려둔 알파를 반드시 되돌린다 — 안 하면 두 번째 질문부터 안 보인다.
    this.full = q.text;
    this.shown = 0;
    this.question.setText('').setAlpha(1);
    this.typing = this.scene.time.addEvent({
      delay: TYPE_MS,
      repeat: this.full.length - 1,
      callback: () => {
        this.shown += 1;
        this.question.setText(this.full.slice(0, this.shown));
        if (this.shown >= this.full.length) this.revealOptions();
      },
    });
  }

  /** 타자 중 Space → 즉시 완성. 완성 후 Space → 확정. */
  confirm() {
    if (this.typing && this.shown < this.full.length) {
      this.typing.remove();
      this.shown = this.full.length;
      this.question.setText(this.full);
      this.revealOptions();
      return;
    }
    if (!this.active) return;

    const opt = this.options[this.index];
    const value = opt.numeric ? this.numValue : opt.value;
    this.active = false;
    this.onPick?.(value);
  }

  move(delta) {
    if (!this.active) return;
    this.index = (this.index + delta + this.options.length) % this.options.length;
    this.paint();
  }

  /** 숫자 입력 항목에서 ←→ 로 값 조절 */
  adjust(delta) {
    if (!this.active) return;
    const opt = this.options[this.index];
    if (!opt.numeric) return;
    this.numValue = Math.min(opt.max, Math.max(opt.min, this.numValue + delta));
    this.paint();
  }

  revealOptions() {
    if (this.rows.length) return;
    this.options.forEach((opt, i) => {
      const t = this.scene.add.text(this.x + 14, this.top + 34 + i * 16, '', {
        fontFamily: FONT, fontSize: '11px', color: COLOR.option, resolution: 1,
      }).setDepth(100).setAlpha(0);
      this.rows.push(t);
      // 손가락 — 항목을 직접 누른다. 손끝은 글자보다 굵으므로 잡히는 상자를 넓게 준다
      t.setInteractive(new Phaser.Geom.Rectangle(-14, -6, 300, 24), Phaser.Geom.Rectangle.Contains);
      t.on('pointerup', () => {
        if (!this.active) return;
        this.index = i;
        this.paint();
        this.confirm();
      });
      // 위에서부터 하나씩 떠오른다
      this.scene.tweens.add({ targets: t, alpha: 1, duration: 220, delay: i * 90 });
    });
    const numeric = this.options.find((o) => o.numeric);
    this.numValue = numeric?.initial ?? 0;
    this.active = true;
    this.paint();
  }

  paint() {
    this.options.forEach((opt, i) => {
      const on = i === this.index;
      const label = opt.numeric
        ? (on ? `◂ ${this.numValue} ▸` : opt.label)
        : (opt.label ?? String(opt.value));
      this.rows[i]
        ?.setText(`${on ? '▸ ' : '  '}${label}`)
        .setColor(on ? COLOR.selected : COLOR.option);
    });
    const opt = this.options[this.index];
    this.hint.setText(opt?.numeric ? '←→ 나이   [Space] 선택' : '↑↓ 이동   [Space] 선택');
  }

  clearRows() {
    for (const r of this.rows) r.destroy();
    this.rows = [];
  }

  fadeOut(ms, done) {
    const targets = [this.question, ...this.rows].filter(Boolean);
    this.hint.setText('');
    this.scene.tweens.add({ targets, alpha: 0, duration: ms, onComplete: () => done?.() });
  }

  destroy() {
    this.typing?.remove();
    this.clearRows();
    this.question.destroy();
    this.hint.destroy();
  }
}
