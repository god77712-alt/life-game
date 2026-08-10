// 중요한 순간에만 켜지는 화면 효과.
//
// **아무 데나 붙이지 않는다.** 점수 팝업(overlay.popScore)이 이미 일상 행동을 맡고 있고,
// 여기 있는 것은 게임이 방향을 트는 네 순간뿐이다:
//
//   goalDoor    골 맵 문이 생긴다      — 골목 아래에 없던 문. 상시 맥동 + 생길 때 한 번 터짐
//   portal      그 문으로 들어간다      — 흰 섬광 후 페이드인
//   collapse    붕괴                   — 색이 빠지고 화면이 눌린다. 소리 없는 쪽이 무섭다
//   reality     현실 인증 +100         — 유일하게 따뜻한 쪽으로 터진다
//
// 전부 Graphics 한 장과 사각형 하나로 그린다. 파티클 시스템을 안 쓴다 —
// 데모용이고, 텍스처를 더 만들면 로딩 순서에 얽힌다.

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';

const W = GRID_W * TILE;
const H = ROOM_TOP + GRID_H * TILE;

const DEPTH = { aura: 8500, burst: 9400, veil: 9700 };

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.aura = scene.add.graphics().setDepth(DEPTH.aura).setVisible(false);
    this.burst = scene.add.graphics().setDepth(DEPTH.burst);
    this.veil = scene.add.rectangle(0, 0, W, H, 0xffffff)
      .setOrigin(0, 0).setDepth(DEPTH.veil).setAlpha(0).setVisible(false);

    this.pulse = null;      // {x, y} 상시 맥동할 타일 (골 맵 문)
    this.shots = [];        // 한 번 터지고 사라지는 것들
    this.t = 0;
  }

  /**
   * 상시 맥동을 켠다/끈다.
   *
   * **타일이 아니라 픽셀을 받는다** — 문은 두 칸짜리일 수 있고, 그때 타일 좌표를
   * 그대로 중심으로 쓰면 빛이 문 왼쪽 절반에만 선다.
   * @param {{cx:number, bottom:number}|null} spot
   */
  markDoor(spot) {
    this.pulse = spot ? { cx: spot.cx, bottom: spot.bottom } : null;
    this.aura.setVisible(!!spot);
    if (!spot) this.aura.clear();
  }

  /** 골 맵 문이 방금 생겼다. 빛이 솟았다가 링 세 개로 퍼진다. */
  doorOpen(spot) {
    this.markDoor(spot);
    this.shots.push({ kind: 'door', ms: 1400, age: 0, cx: spot.cx, bottom: spot.bottom });
    this.shake(6, 500);
  }

  /** 문을 통과했다. 흰 섬광 → 서서히 걷힌다. */
  portal() {
    this.flash(0xffffff, 0.95, 900);
  }

  /**
   * 붕괴. 화면이 한 번 눌렸다가 검푸른 것이 천천히 걷힌다.
   * 점수가 0이 되는 것은 규칙이 하는 일이고, 이건 그 순간을 놓치지 말라는 표시일 뿐이다.
   */
  collapse() {
    this.flash(0x0b1020, 1, 2200);
    this.shake(10, 900);
  }

  /** 현실 인증 통과. 이 게임에서 유일하게 밖으로 퍼지는 빛. */
  reality(cx = W / 2, cy = H / 2) {
    this.shots.push({ kind: 'warm', ms: 1600, age: 0, px: cx, py: cy });
    this.flash(0xffe27a, 0.55, 1100);
  }

  // ── 내부 ────────────────────────────────────────────────

  flash(color, alpha, ms) {
    this.veil.setFillStyle(color).setAlpha(alpha).setVisible(true);
    this.shots.push({ kind: 'veil', ms, age: 0, from: alpha });
  }

  shake(px, ms) {
    this.scene.cameras?.main?.shake?.(ms, px / 1000);
  }

  /** @param {number} delta ms */
  step(delta) {
    this.t += delta;

    // 상시 맥동 — 그 자리에 가야 할 것이 있다는 표시. 숨 쉬듯 느리게.
    if (this.pulse) {
      const k = 0.5 + 0.5 * Math.sin(this.t / 420);
      const cx = this.pulse.cx;
      const cy = this.pulse.bottom - TILE / 2;
      const g = this.aura.clear();
      g.fillStyle(0xffe27a, 0.10 + 0.10 * k).fillCircle(cx, cy, 14 + 6 * k);
      g.lineStyle(1, 0xffe27a, 0.35 + 0.35 * k).strokeCircle(cx, cy, 16 + 8 * k);
    }

    if (!this.shots.length) return;
    const g = this.burst.clear();

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += delta;
      const k = s.age / s.ms;
      if (k >= 1) {
        if (s.kind === 'veil') this.veil.setAlpha(0).setVisible(false);
        this.shots.splice(i, 1);
        continue;
      }

      if (s.kind === 'veil') {
        this.veil.setAlpha(s.from * (1 - k) ** 2);
        continue;
      }

      if (s.kind === 'door') {
        const { cx, bottom } = s;
        // 빛기둥: 바닥에서 위로 자랐다가 사라진다
        const grow = Math.min(1, k * 3);
        const h = 90 * (1 - (1 - grow) ** 3);
        g.fillStyle(0xffe27a, 0.55 * (1 - k)).fillRect(cx - 5, bottom - h, 10, h);
        g.fillStyle(0xfff6d0, 0.8 * (1 - k)).fillRect(cx - 2, bottom - h, 4, h);
        // 링 세 개가 시차를 두고 퍼진다
        for (let n = 0; n < 3; n++) {
          const rk = (k - n * 0.14) / 0.6;
          if (rk <= 0 || rk >= 1) continue;
          const r = 6 + (1 - (1 - rk) ** 3) * 46;
          g.lineStyle(2, 0xffe27a, (1 - rk) * 0.9).strokeCircle(cx, bottom - TILE / 2, r);
        }
        continue;
      }

      if (s.kind === 'warm') {
        for (let n = 0; n < 4; n++) {
          const rk = (k - n * 0.12) / 0.7;
          if (rk <= 0 || rk >= 1) continue;
          const r = 10 + (1 - (1 - rk) ** 3) * 190;
          g.lineStyle(3, n % 2 ? 0xfff6d0 : 0xffd447, (1 - rk) * 0.7)
            .strokeCircle(s.px, s.py, r);
        }
      }
    }
  }
}
