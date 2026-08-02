// 화면에 겹쳐 그리는 것들 — 시계 HUD, 점수 팝업, 정산창.
// 폰트는 임시 시스템 monospace. 비트맵 한글 폰트가 들어오면 FONT만 바꾼다 (ART.md §5).

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';
import { fmt, wakeAfter } from '../game/clock.js';

const W = GRID_W * TILE;                 // 384
const H = ROOM_TOP + GRID_H * TILE;      // 352
const FONT = 'monospace';

const DEPTH = { hud: 9300, pop: 9350, panel: 9600 };
const POP_MS = 900;    // 점수 숫자가 떠 있는 시간
const RING_MS = 420;   // 퍼지는 링
const LOG_MAX = 9;     // 정산창에 적는 행동 줄 수 상한 — 넘으면 상자가 화면을 넘는다

const text = (scene, size, color) => ({
  fontFamily: FONT, fontSize: `${size}px`, color, resolution: 1,
});

/** 각진 베벨 상자 — 90년대 UI (ART.md §5) */
function bevel(g, x, y, w, h, fill = 0x1c1815, alpha = 0.94) {
  g.fillStyle(fill, alpha).fillRect(x, y, w, h)
    .fillStyle(0x5a4f42, 1).fillRect(x, y, w, 1).fillRect(x, y, 1, h)
    .fillStyle(0x0f0c0a, 1).fillRect(x, y + h - 1, w, 1).fillRect(x + w - 1, y, 1, h);
}

export class Overlay {
  constructor(scene) {
    this.scene = scene;
    this.pops = [];          // 떠 있는 점수 팝업 — 날이 바뀌면 정리한다
    this.ringG = scene.add.graphics().setDepth(DEPTH.pop - 1);

    // ── HUD: 날짜·시각·오늘 점수 ──
    this.hudG = scene.add.graphics().setDepth(DEPTH.hud);
    this.hudLeft = scene.add.text(6, 5, '', text(scene, 10, '#e8dcc0')).setDepth(DEPTH.hud + 1);
    this.hudRight = scene.add.text(W - 6, 5, '', text(scene, 10, '#ffd447'))
      .setOrigin(1, 0).setDepth(DEPTH.hud + 1);

    // ── 정산창 ──
    this.panelG = scene.add.graphics().setDepth(DEPTH.panel).setVisible(false);
    this.panelText = scene.add.text(W / 2, 0, '', {
      ...text(scene, 10, '#e8dcc0'), align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(DEPTH.panel + 1).setVisible(false);
    this.panelTitle = scene.add.text(W / 2, 0, '', text(scene, 14, '#ffd447'))
      .setOrigin(0.5, 0).setDepth(DEPTH.panel + 1).setVisible(false);
  }

  // ── 시계 HUD ────────────────────────────────────────────

  drawHud(clock, todayScore, total) {
    this.hudLeft.setText(`DAY ${clock.day}   ${clock.label}`);
    this.hudRight.setText(`오늘 +${todayScore}   누적 ${total}`);

    const g = this.hudG.clear();
    bevel(g, 2, 2, this.hudLeft.width + 8, 16);
    bevel(g, W - this.hudRight.width - 10, 2, this.hudRight.width + 8, 16);

    // 하루가 얼마나 남았는지 가느다란 게이지로. 숫자를 못 읽어도 알게.
    const barW = W - 6;
    g.fillStyle(0x0f0c0a, 0.9).fillRect(3, 20, barW, 2);
    g.fillStyle(clock.progress > 0.85 ? 0xc25a4a : 0x8a7c6b, 1)
      .fillRect(3, 20, Math.round(barW * clock.progress), 2);
  }

  // ── 점수 팝업 ───────────────────────────────────────────

  /**
   * 점수를 얻은 자리에서 숫자가 떠오른다. 어디서 뭘 얻었는지 눈으로 알게.
   * 트윈 매니저를 쓰지 않고 씬 update()에서 직접 굴린다 — 검증 가능하고 부품이 하나 줄어든다.
   */
  popScore(cx, cy, amount) {
    const t = this.scene.add.text(Math.round(cx), Math.round(cy), `+${amount}`, {
      ...text(this.scene, 12, '#ffe27a'),
      stroke: '#241a0c', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH.pop);

    this.pops.push({ text: t, cx: Math.round(cx), cy: Math.round(cy), age: 0 });
  }

  /** @param {number} delta ms */
  stepPops(delta) {
    const g = this.ringG.clear();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.age += delta;
      const k = p.age / POP_MS;
      if (k >= 1) {
        p.text.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      const rise = 1 - (1 - k) * (1 - k);                       // 위로 빠르게 뜨다 감속
      p.text.setY(p.cy - Math.round(22 * rise));
      p.text.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);       // 뒤쪽 40%에서만 사라진다

      const rk = p.age / RING_MS;                                // 얻은 자리에서 퍼지는 링
      if (rk < 1) {
        const spread = 1 - (1 - rk) ** 3;
        g.lineStyle(2, 0xffe27a, 1 - rk).strokeCircle(p.cx, p.cy - 6, 4 + spread * 16);
      }
    }
  }

  /** 하루가 바뀌거나 방이 갈릴 때 떠 있던 팝업을 정리한다. */
  clearPops() {
    for (const p of this.pops) p.text.destroy();
    this.pops.length = 0;
    this.ringG.clear();
  }

  // ── 정산창 ──────────────────────────────────────────────

  /**
   * 하루의 리듬 단위이자, 나중에 붕괴 연출이 서는 무대 (DESIGN.md §2).
   *
   * `director`는 이미 문장으로 만들어져서 온다 (`game/table.js`).
   * 여기서는 그리기만 한다 — 같은 문자열을 DEV 패널도 쓰기 때문에
   * 만드는 자리가 둘로 갈리면 화면과 디버그가 서로 다른 말을 하게 된다.
   *
   * @param {{day:number, reason:string, sleepMinutes:number, log:Array,
   *          todayScore:number, total:number, director?:string[]}} s
   */
  showSettlement(s) {
    this.panelTitle.setText(`DAY ${s.day}  정산`);

    // 들어갈 때까지 뒤에서부터 잘라낸다.
    // 잘 산 하루는 행동이 열 개가 넘고 가설도 여럿이라 상자가 캔버스(352px)를 뚫는다 —
    // 실제로 뚫려서 제목 줄이 화면 밖으로 나갔다. **줄 순서가 곧 우선순위다**
    // (game/table.js가 중요한 것부터 담아 보낸다).
    const director = [...(s.director ?? [])];
    let boxH = 0;
    for (;;) {
      this.panelText.setText(this.settlementLines(s, director).join('\n'));
      boxH = this.panelTitle.height + 8 + this.panelText.height + 32;
      if (boxH <= H - 8 || director.length === 0) break;
      director.pop();
    }

    const boxW = Math.min(W - 8, Math.max(200, this.panelText.width + 40));
    const bx = Math.round((W - boxW) / 2);
    const by = Math.round((H - boxH) / 2);

    this.panelG.clear();
    this.panelG.fillStyle(0x05060a, 0.72).fillRect(0, 0, W, H);   // 방을 덮는다
    bevel(this.panelG, bx, by, boxW, boxH, 0x191512, 0.98);
    this.panelG.fillStyle(0x3b342e, 1).fillRect(bx + 8, by + 26, boxW - 16, 1);

    this.panelTitle.setY(by + 10);
    this.panelText.setY(by + 30);

    this.panelG.setVisible(true);
    this.panelTitle.setVisible(true);
    this.panelText.setVisible(true);
  }

  /** @returns {string[]} 정산창 본문 */
  settlementLines(s, director) {
    const lines = [];
    lines.push('');
    if (s.log.length === 0) {
      lines.push('아무것도 하지 않았다');
    } else {
      // 잘 산 하루는 행동이 열다섯 개도 된다. 다 적으면 상자가 화면(352px)을 넘는다
      for (const e of s.log.slice(0, LOG_MAX)) {
        const tier = e.tier ? `${e.tier} ` : '   ';
        lines.push(`${tier}${e.label.padEnd(9, ' ')}  +${e.score}`);
      }
      if (s.log.length > LOG_MAX) lines.push(`… 외 ${s.log.length - LOG_MAX}개`);
    }
    lines.push('');
    lines.push('─'.repeat(22));
    lines.push(`오늘${' '.repeat(12)}+${s.todayScore}`);
    lines.push(`누적${' '.repeat(13)}${s.total}`);
    lines.push('');
    lines.push(
      s.reason === 'sleep'
        ? `${fmt(s.sleepMinutes)} 취침 → 내일 ${fmt(wakeAfter(s.sleepMinutes))} 기상`
        : '자정이 지났다. 아직 자지 않았다'
    );
    if (s.reason !== 'sleep') lines.push('00:00 부터 하루가 다시 시작된다');

    // 디렉터가 지금 무엇을 알고 있는가. 정산을 기다리는 이 화면이 그걸 보여줄 유일한 자리다
    if (director?.length) lines.push(...director);

    lines.push('');
    lines.push('[Space]');
    return lines;
  }

  hideSettlement() {
    this.panelG.setVisible(false);
    this.panelTitle.setVisible(false);
    this.panelText.setVisible(false);
  }
}
