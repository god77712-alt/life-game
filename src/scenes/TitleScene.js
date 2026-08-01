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
import { fitHitArea } from '../ui/hitarea.js';

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

    // 손가락 — 항목을 직접 누른다.
    // **줄 하나를 화면 폭 전체의 띠로 잡는다.** 여기는 게임에서 제일 처음 누르는 곳이라
    // 빗나가면 그대로 막힌다. 높이는 줄 간격(22)까지 — 넘기면 옆 줄과 겹친다.
    this.rows.forEach((row, i) => {
      row.on('pointerup', () => { this.index = i; this.paint(); this.choose(); });
    });
    this.fitRows();

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
    this.fitRows();     // 글이 바뀌면 폭도 바뀐다. 판정 영역을 다시 맞춘다
  }

  /**
   * 줄마다 화면 폭 전체를 덮는 띠를 판정 영역으로 준다.
   * 글자는 origin(0.5)로 가운데 정렬돼 있고 판정 좌표는 글자 좌상단 기준이므로,
   * 왼쪽 끝은 `글자폭/2 - 화면중앙`이 된다.
   */
  fitRows() {
    for (const row of this.rows) {
      fitHitArea(row, { left: row.width / 2 - W / 2, width: W, height: 22 });
    }
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
