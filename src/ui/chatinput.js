// 직접 말하기 — 플레이어가 자기 문장을 치는 곳.
//
// **이 게임에서 가장 중요한 입력이다.** 최종 목표가 "이 사람이 자기 얘기를 하는 것"이고,
// 선택지는 남이 써준 말이라 세지 않는다. 자기 얘기는 오직 여기서만 나온다.
//
// 왜 캔버스가 아니라 HTML인가 — 한글은 IME를 거친다. 조합 중인 글자(ㅎ→하→한)를
// canvas가 받으려면 브라우저 조합 이벤트를 직접 다뤄야 하는데, input 하나면 끝난다.
//
// 함께 고친 것: 타이핑 중에는 Phaser 키보드를 통째로 끈다.
// 안 끄면 방향키가 캐릭터를 움직이고, 예전에는 R이 게임을 리셋했다.

import { TILE, ROOM_TOP, ZOOM } from '../render/textures.js';
import { GRID_W, GRID_H } from '../room/schema.js';

const MAX_LEN = 200;

/** 게임이 브라우저에서 가로채는 키. 입력 중엔 풀었다가 끝나면 되돌린다. */
const CAPTURE = 'UP,DOWN,LEFT,RIGHT,SPACE,W,A,S,D';

export class ChatInput {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.open = false;

    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = MAX_LEN;
    el.autocomplete = 'off';
    el.setAttribute('aria-label', '직접 말하기');
    Object.assign(el.style, {
      position: 'absolute', display: 'none', zIndex: '50',
      background: 'transparent', border: '0', outline: 'none',
      color: '#e8dcc0', font: '22px monospace', padding: '0',
      caretColor: '#ffd447',
    });
    document.body.append(el);
    this.el = el;

    el.addEventListener('keydown', (e) => {
      // 조합 중(한글 자모를 아직 맞추는 중)에는 Enter가 확정용이다. 보내면 안 된다.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); this.send(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
      e.stopPropagation();
    });
    el.addEventListener('input', () => this.onType?.(el.value));
    // 다른 데를 눌러 포커스가 빠지면 게임 키가 안 돌아온다 — 되돌려준다
    el.addEventListener('blur', () => { if (this.open) el.focus(); });

    this.place();
    this.onResize = () => this.place();
    window.addEventListener('resize', this.onResize);
  }

  /** 대화 상자 안쪽에 겹쳐 놓는다. 캔버스가 확대돼 있으므로 배율을 곱한다. */
  place() {
    const canvas = this.scene.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const scale = r.width / (GRID_W * TILE);            // 창 크기가 바뀌어도 따라간다
    const boxTop = ROOM_TOP + GRID_H * TILE - 92 - 6;   // Dialogue의 BOX와 같은 계산

    Object.assign(this.el.style, {
      left: `${r.left + window.scrollX + 14 * scale}px`,
      top: `${r.top + window.scrollY + (boxTop + 22) * scale}px`,   // Dialogue의 body와 같은 줄
      width: `${(GRID_W * TILE - 12 - 16) * scale}px`,
      fontSize: `${11 * scale}px`,
      lineHeight: `${16 * scale}px`,
      height: `${18 * scale}px`,
    });
    void ZOOM;   // 배율은 실측 rect에서 뽑는다 — 창이 줄면 ZOOM과 달라진다
  }

  /**
   * @param {(text: string) => void} onSend
   * @param {() => void} onCancel
   */
  show(onSend, onCancel) {
    this.onSend = onSend;
    this.onCancel = onCancel;
    this.open = true;
    this.el.value = '';
    this.place();
    this.el.style.display = 'block';

    // Phaser가 키를 먹으면 글자가 씹힌다. **두 겹을 다 풀어야 한다.**
    //   enabled = false     씬의 키 핸들러를 멈춘다
    //   clearCaptures()     document에 걸린 preventDefault를 푼다
    // 두 번째를 빼먹으면 스페이스가 안 들어가서 "나도요즘밖에"가 된다 (실제로 그랬다).
    const kb = this.scene.input.keyboard;
    kb.enabled = false;
    kb.clearCaptures();
    this.el.focus();
  }

  send() {
    const text = this.el.value.trim();
    if (!text) return this.cancel();
    const fn = this.onSend;
    this.hide();
    fn?.(text);
  }

  cancel() {
    const fn = this.onCancel;
    this.hide();
    fn?.();
  }

  hide() {
    this.open = false;
    this.el.style.display = 'none';
    this.el.blur();
    const kb = this.scene.input.keyboard;
    kb.enabled = true;
    kb.addCapture(CAPTURE);          // 방향키가 다시 페이지를 스크롤시키지 않게
    this.onSend = this.onCancel = null;
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
  }
}
