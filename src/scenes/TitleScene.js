// 게임의 입구.
//
// 지금까지는 접속하면 곧장 설문이 시작됐다. 제목도, 이어하기도, 무슨 게임인지도 없이.
// **끝나는 날이 정해져 있지 않은 게임이다.** 결과가 나올 때까지 산다.
// 그러니 **다시 들어올 문**이 반드시 있어야 한다.
//
// 여기서 하는 말은 세 줄을 넘지 않는다. 이 게임은 자기 설명을 길게 하지 않는다 —
// 무엇을 하는 게임인지는 마지막 날에 알게 되는 편이 낫다.

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';
import * as save from '../game/save.js';

const W = GRID_W * TILE;
const H = ROOM_TOP + GRID_H * TILE;
const FONT = 'monospace';

const C = {
  bg: 0x0d0b0a,
  title: '#e8dcc0',
  sub: '#7d6f5c',
  on: '#ffd447',
  off: '#7d6f5c',
  faint: '#4a4139',
};

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create() {
    this.add.rectangle(0, 0, W, H, C.bg).setOrigin(0, 0).setDepth(-1);

    const cx = W / 2;
    this.add.text(cx, 92, '힘을 내', {
      fontFamily: FONT, fontSize: '15px', color: C.sub, resolution: 1,
    }).setOrigin(0.5, 0.5);
    this.add.text(cx, 118, '히키코모리', {
      fontFamily: FONT, fontSize: '26px', color: C.title, resolution: 1,
    }).setOrigin(0.5, 0.5);

    // 한 줄. 이 게임이 무엇을 하는지는 말하지 않는다
    this.add.text(cx, 156, '당신의 방이 이 게임의 무대가 된다.', {
      fontFamily: FONT, fontSize: '10px', color: C.sub, resolution: 1,
    }).setOrigin(0.5, 0.5);

    this.saved = save.describe();
    this.items = this.saved
      ? [
        { id: 'resume', text: `이어하기   DAY ${this.saved.day} · 누적 ${this.saved.total}` },
        { id: 'new', text: '처음부터' },
      ]
      : [{ id: 'new', text: '시작' }];

    this.rows = this.items.map((it, i) => this.add.text(cx, 214 + i * 22, '', {
      fontFamily: FONT, fontSize: '12px', color: C.off, resolution: 1,
    }).setOrigin(0.5, 0.5));

    if (this.saved) {
      this.add.text(cx, 214 + this.items.length * 22 + 10, `마지막 저장 ${this.saved.when}`, {
        fontFamily: FONT, fontSize: '9px', color: C.faint, resolution: 1,
      }).setOrigin(0.5, 0.5);
    }

    this.add.text(cx, H - 26, '↑↓ 고르기    [Space] 시작', {
      fontFamily: FONT, fontSize: '9px', color: C.faint, resolution: 1,
    }).setOrigin(0.5, 0.5);

    this.index = 0;
    this.paint();

    const k = this.input.keyboard;
    k.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,W,A,S,D');
    for (const key of ['UP', 'W']) k.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['DOWN', 'S']) k.on(`keydown-${key}`, () => this.move(1));
    k.on('keydown-SPACE', (e) => { e.preventDefault?.(); this.choose(); });

    // 개발용 — 타이틀도 건너뛴다
    if (new URLSearchParams(location.search).has('skip')) {
      this.time.delayedCall(0, () => this.start('new'));
    }
  }

  move(d) {
    if (this.items.length < 2) return;
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.paint();
  }

  paint() {
    this.items.forEach((it, i) => {
      const on = i === this.index;
      this.rows[i].setText(`${on ? '▸ ' : '  '}${it.text}`).setColor(on ? C.on : C.off);
    });
  }

  choose() {
    this.start(this.items[this.index].id);
  }

  start(id) {
    if (id === 'resume') {
      // 저장은 방 정보까지 들고 있다. 설문·사진을 다시 받을 이유가 없다
      this.scene.start('room', { resume: true });
      return;
    }
    save.clear();
    this.scene.start('intro');
  }
}
