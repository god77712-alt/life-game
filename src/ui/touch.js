// 손가락으로 하는 조작.
//
// 이 게임은 **행동 키가 하나뿐이다** — 바라보는 대상이 행동을 정한다.
// 그 규칙은 "무엇을 하는가"에 걸린 것이지 "어디로 걷는가"에 걸린 게 아니다.
// 그래서 조작은 이 둘로 나뉜다:
//
//   걷기    왼쪽 아래 이동 패드 (누르고 있으면 계속 걷는다. 밀면 방향이 바뀐다)
//           또는 가고 싶은 칸을 직접 누른다
//   행동    바라보는 대상을 누른다  ·  오른쪽 아래 [확인] 버튼   = Space 하나
//
// 칸을 눌러 걷는 방식만 뒀더니 실제로 불편했다 — 한 칸 갈 때마다 손가락을
// 화면 가운데로 가져가야 하고, 목적지가 캐릭터 바로 옆이면 누를 자리가 좁다.
// 패드는 엄지를 한자리에 두고 걷게 한다. 대신 **행동 버튼을 늘리지는 않는다** —
// 방향을 여러 개 두는 것과 행동을 여러 개 두는 것은 다른 얘기다.
//
// 대화 중에는 패드 위아래가 선택지 커서가 된다 (키보드 ↑↓과 같다).

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';

/** 손가락이 이만큼 넘게 움직였으면 누른 게 아니라 쓸어넘긴 것이다 */
const TAP_SLOP = 14;

/** 패드 한가운데 이만큼(반지름 비율)은 방향이 없다. 엄지를 얹어두기만 한 상태 */
const DEAD = 0.26;

export class Touch {
  /** @param {Phaser.Scene} scene RoomScene */
  constructor(scene) {
    this.scene = scene;
    // 손가락이 있는 기기인가. `hover: none` 하나만 보면 놓치는 기기가 있다 —
    // maxTouchPoints가 제일 곧은 신호다 (터치 노트북까지 잡히지만, 잡혀도 손해가 없다)
    // `?pad` — 데스크톱에서도 켠다. 시연 영상 녹화와 눈으로 하는 확인용
    this.enabled = navigator.maxTouchPoints > 0
      || matchMedia('(hover: none)').matches
      || 'ontouchstart' in window
      || new URLSearchParams(location.search).has('pad');

    // **손가락마다 따로 센다.** 슬롯 하나에 담으면 두 번째 손가락이 첫 번째의
    // 시작점을 덮어써서, 원래 손가락을 뗄 때 엉뚱한 거리로 재고 탭이 통째로 무시된다.
    // 폰에서는 손바닥이 스치는 것만으로도 이 일이 일어난다.
    this.down = new Map();

    /** 지금 패드가 붙들고 있는 방향. RoomScene.readInput()이 매 프레임 읽는다 */
    this.held = null;
    this.padId = null;

    scene.input.on('pointerdown', (p) => { this.down.set(p.id, { x: p.x, y: p.y }); });
    scene.input.on('pointerup', (p) => {
      const d = this.down.get(p.id);
      this.down.delete(p.id);
      if (!d) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP) return;   // 쓸어넘긴 것이다
      this.tap(p.x, p.y);
    });

    if (this.enabled) {
      this.mountStyle();
      this.mountPad();
      this.mountButton();
    }

    // 씬이 다시 시작되면(엔딩 → 타이틀 → 방) 이 객체는 버려진다.
    // 그때 버튼들을 걷지 않으면 화면에 죽은 조작부가 겹겹이 쌓인다 —
    // 각자 이미 끝난 씬을 붙들고 있어서 누르면 아무 일도 안 난다.
    scene.events.once('shutdown', () => this.destroy());
  }

  // ── 화면을 직접 누르기 ──────────────────────────────────

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

  // ── 이동 패드 ───────────────────────────────────────────

  /**
   * 누른 자리가 패드 한가운데에서 어느 쪽인가.
   *
   * 칸(버튼)을 네 개 두는 대신 **좌표로 판정한다.** 그래야 엄지를 뗐다 붙이지 않고
   * 밀기만 해도 방향이 바뀐다 — 실제 십자키의 감각이 거기서 나온다.
   */
  dirAt(e) {
    const r = this.pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.hypot(dx, dy) < DEAD) return null;
    return Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
  }

  /**
   * 방향이 **바뀌는 순간**에만 부른다.
   * 계속 걷는 것은 씬의 폴링(readInput)이 맡는다 — 여기서 반복을 만들지 않는다.
   */
  press(dir) {
    if (dir === this.held) return;
    this.held = dir;
    this.pad.dataset.on = dir ?? '';
    if (!dir) return;

    const s = this.scene;
    // 대화 중에는 위아래가 선택지 커서다. 키보드 ↑↓과 같은 규칙 —
    // 누를 때 한 번만 움직인다. (씬 update가 대화 중엔 held를 읽지 않는다)
    if (s.dialogue.open) {
      if (dir === 'up') s.dialogue.move(-1);
      else if (dir === 'down') s.dialogue.move(1);
      return;
    }
    // 프레임 사이에 끝난 짧은 탭도 한 칸은 걷게. 키보드 keydown과 같은 이유다
    s.queued = dir;
  }

  mountPad() {
    const pad = document.createElement('div');
    pad.id = 'dpad';
    pad.setAttribute('aria-label', '이동');
    pad.innerHTML = '<b></b>'
      + [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']]
        .map(([d, g]) => `<i data-d="${d}">${g}</i>`).join('');

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // 손가락이 패드 밖으로 나가도 이 패드가 계속 받는다. 안 그러면
      // 밀다가 경계를 넘는 순간 방향이 붙들린 채로 남는다.
      // 붙잡기에 실패해도 조작 자체는 돌아야 한다 — 여기서 던지면 방향이 아예 안 들어간다
      try { pad.setPointerCapture(e.pointerId); } catch { /* 없는 포인터 */ }
      this.padId = e.pointerId;
      this.press(this.dirAt(e));
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.padId) return;
      this.press(this.dirAt(e));
    });
    const release = (e) => {
      if (e.pointerId !== this.padId) return;
      this.padId = null;
      this.press(null);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    // 창이 가려지거나 전화가 오면 pointerup이 안 온다. 방향이 붙들린 채 남으면
    // 캐릭터가 혼자 벽에 붙어 계속 걷는다
    this.onBlur = () => this.press(null);
    window.addEventListener('blur', this.onBlur);

    document.body.append(pad);
    this.pad = pad;
  }

  // ── 행동 버튼 ───────────────────────────────────────────

  /**
   * 화면 위에 뜨는 동그란 버튼 하나. **이것 하나뿐이다.**
   * 무엇을 하는 버튼인지는 안 쓰여 있다 — 바라보는 대상이 정하기 때문이다.
   */
  mountButton() {
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
    document.body.append(b);
    this.button = b;
  }

  mountStyle() {
    const style = document.createElement('style');
    style.textContent = `
      /* 아래쪽에 개발 도구 막대가 깔려 있다. 그 위로 올라앉는다 */
      #tapkey,#dpad{position:fixed;bottom:calc(46px + env(safe-area-inset-bottom));z-index:60;
        -webkit-tap-highlight-color:transparent;touch-action:none;user-select:none}
      #tapkey{right:16px;width:64px;height:64px;border-radius:50%;
        border:1px solid #5a4f42;background:rgba(20,17,15,.82);color:#ffd447;
        font:600 12px/1 ui-monospace,monospace;letter-spacing:.05em;
        display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(2px)}
      #tapkey:active{background:#ffd447;color:#14110f}

      /* 십자키. 판정은 좌표로 하므로 이 칸들은 그림일 뿐이다(pointer-events 없음) */
      #dpad{left:16px;width:132px;height:132px;cursor:pointer;
        display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr)}
      #dpad i,#dpad b{display:grid;place-items:center;font-style:normal;pointer-events:none;
        background:rgba(20,17,15,.82);border:1px solid #5a4f42;backdrop-filter:blur(2px);
        font:600 14px/1 ui-monospace,monospace;color:#c9b799}
      #dpad b{grid-area:2/2;border-color:#3b342e;background:rgba(20,17,15,.6)}
      #dpad i[data-d=up]{grid-area:1/2}
      #dpad i[data-d=left]{grid-area:2/1}
      #dpad i[data-d=right]{grid-area:2/3}
      #dpad i[data-d=down]{grid-area:3/2}
      #dpad[data-on=up] i[data-d=up],#dpad[data-on=down] i[data-d=down],
      #dpad[data-on=left] i[data-d=left],#dpad[data-on=right] i[data-d=right]{
        background:#ffd447;color:#14110f}

      /* 짧은 화면 — 게임(12:11)이 세로를 덜 남기므로 패드가 화면 아래쪽을 파고든다.
         360×640에서 실제로 23px 겹친다. 조작부를 줄여 게임을 가리지 않게 한다 */
      @media (max-height: 700px){
        #dpad{width:108px;height:108px}
        #tapkey{width:56px;height:56px;font-size:11px}
      }
    `;
    document.head.append(style);
    this.style = style;
  }

  destroy() {
    this.held = null;
    if (this.onBlur) window.removeEventListener('blur', this.onBlur);
    this.pad?.remove();
    this.button?.remove();
    this.style?.remove();
  }
}
