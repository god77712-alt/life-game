// 손가락으로 하는 조작.
//
// 이 게임은 키가 하나뿐이다 — 바라보는 대상이 행동을 정한다.
// **터치도 같은 규칙을 따라야 한다.** 버튼을 여러 개 두면 그 설계가 무너진다.
//
//   빈 칸을 누른다        그쪽으로 한 칸 걷는다
//   바라보는 대상을 누른다  그 행동을 한다 (= Space)
//   대화 중에 아무 데나     다음으로 (= Space)
//   ● 버튼                 언제나 Space. 손이 헷갈릴 때를 위한 보험
//
// 왜 D패드가 아닌가 — 타일 스냅 4방향이라 "가고 싶은 칸을 누른다"가 더 곧다.
// 화면이 12×10칸뿐이라 칸이 충분히 크고, 90년대 온라인 게임들도 이렇게 걸었다.

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';

/** 손가락이 이만큼 넘게 움직였으면 누른 게 아니라 쓸어넘긴 것이다 */
const TAP_SLOP = 14;

export class Touch {
  /** @param {Phaser.Scene} scene RoomScene */
  constructor(scene) {
    this.scene = scene;
    this.enabled = matchMedia('(hover: none)').matches || 'ontouchstart' in window;

    scene.input.on('pointerdown', (p) => { this.down = { x: p.x, y: p.y }; });
    scene.input.on('pointerup', (p) => {
      const d = this.down;
      this.down = null;
      if (!d) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP) return;   // 스크롤이었다
      this.tap(p.x, p.y);
    });

    if (this.enabled) this.mountButton();
  }

  /**
   * 게임 화면 좌표 → 무엇을 눌렀는가.
   * Phaser가 배율을 이미 풀어서 준다(p.x는 384 기준). 그래서 화면 크기와 무관하다.
   */
  tap(x, y) {
    const s = this.scene;

    // 대화 중에는 어디를 눌러도 다음으로. 이게 제일 많이 쓰인다.
    // 단 선택지 화면에서는 항목을 직접 누르게 두고 여기서 빠진다 —
    // 안 그러면 한 번 눌렀는데 고르고 넘어가는 일이 두 번 일어난다
    if (s.dialogue.open) {
      if (s.dialogue.phase !== 'choices') s.dialogue.advance();
      return;
    }
    if (s.settling) { s.nextDay(); return; }

    const tx = Math.floor(x / TILE);
    const ty = Math.floor((y - ROOM_TOP) / TILE);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return;

    // 바라보는 대상을 눌렀으면 상호작용. 서 있는 자리를 눌러도 마찬가지 —
    // 문 앞에 서서 문을 다시 누르는 게 자연스럽다
    const t = s.currentTarget();
    if (t && this.hits(t, tx, ty)) { s.interact(); return; }
    if (tx === s.gx && ty === s.gy) { s.interact(); return; }

    // 아니면 그쪽으로 한 칸. 먼 축을 먼저 좁힌다
    const dx = tx - s.gx;
    const dy = ty - s.gy;
    if (!dx && !dy) return;
    s.queued = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
  }

  /** 그 칸이 대상의 몸(또는 무대 프롭)에 걸치는가 */
  hits(t, tx, ty) {
    const o = t.prop ?? t.obj;
    if (!o) return false;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    return tx >= o.x && tx < o.x + w && ty >= o.y && ty < o.y + h;
  }

  /**
   * 화면 위에 뜨는 동그란 버튼 하나. **터치 기기에서만.**
   * 칸을 눌러 걷다 보면 상호작용을 어디서 눌러야 할지 헷갈릴 때가 있다 — 그때의 보험이다.
   */
  mountButton() {
    const style = document.createElement('style');
    style.textContent = `
      #tapkey{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));
        z-index:60;width:62px;height:62px;border-radius:50%;
        border:1px solid #5a4f42;background:rgba(20,17,15,.82);color:#ffd447;
        font:600 12px/1 ui-monospace,monospace;letter-spacing:.05em;
        display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;
        backdrop-filter:blur(2px);touch-action:manipulation}
      #tapkey:active{background:#ffd447;color:#14110f}
    `;
    const b = document.createElement('button');
    b.id = 'tapkey';
    b.type = 'button';
    b.textContent = '확인';
    b.setAttribute('aria-label', '상호작용');
    // click은 300ms 늦는 기기가 있다. 손을 뗄 때 바로 반응한다
    b.addEventListener('pointerup', (e) => {
      e.preventDefault();
      const s = this.scene;
      if (s.dialogue.open) s.dialogue.advance();
      else if (s.settling) s.nextDay();
      else s.interact();
    });
    document.body.append(style, b);
    this.button = b;
    this.style = style;
  }

  destroy() {
    this.button?.remove();
    this.style?.remove();
  }
}
