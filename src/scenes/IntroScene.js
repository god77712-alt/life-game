// Act 0 앞단 — 시작 설문. 무대를 세우고 방으로 넘긴다.
//
// 마지막 문항 직후 캐스팅 AI를 발사하고 **기다리지 않는다.**
// 플레이어가 방 사진을 찍는 동안 돌면 34~46초는 그대로 가려진다 (DESIGN.md §5).

import { GRID_W, GRID_H } from '../room/schema.js';
import { TILE, ROOM_TOP } from '../render/textures.js';
import { SURVEY, isComplete } from '../game/survey.js';
import { Chooser } from '../ui/chooser.js';
import { RoomPhoto } from '../ui/roomphoto.js';

const W = GRID_W * TILE;
const H = ROOM_TOP + GRID_H * TILE;

export class IntroScene extends Phaser.Scene {
  constructor() {
    super('intro');
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x080a0e).setOrigin(0, 0).setDepth(-1);

    this.answers = {};
    this.step = 0;
    this.chooser = new Chooser(this);

    const k = this.input.keyboard;
    // 방향키·Space가 페이지를 스크롤시키지 않게 브라우저 기본 동작을 막는다
    k.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,W,A,S,D');

    k.on('keydown-UP', () => this.chooser.move(-1));
    k.on('keydown-W', () => this.chooser.move(-1));
    k.on('keydown-DOWN', () => this.chooser.move(1));
    k.on('keydown-S', () => this.chooser.move(1));
    k.on('keydown-LEFT', () => this.chooser.adjust(-1));
    k.on('keydown-A', () => this.chooser.adjust(-1));
    k.on('keydown-RIGHT', () => this.chooser.adjust(1));
    k.on('keydown-D', () => this.chooser.adjust(1));
    k.on('keydown-SPACE', (e) => { e.preventDefault?.(); this.chooser.confirm(); });

    // 개발용. ?skip 이면 설문 첫 보기로 채우고 바로 방으로 — 맵·대화만 볼 때 9문항이 낭비다.
    // 답이 항상 같으니 캐스팅 호출도 응답 캐시에 걸린다.
    if (new URLSearchParams(location.search).has('skip')) {
      for (const q of SURVEY) this.answers[q.key] = q.options?.[0]?.value ?? q.min ?? 0;
      this.step = SURVEY.length;
      this.skip = true;              // 페이드 없이 바로 넘어간다 (개발용이라 연출이 필요 없다)
      this.finish();
      return;
    }

    // 손가락 — 화면 아무 데나 누르면 타자를 건너뛴다. 항목은 Chooser가 직접 받는다
    this.input.on('pointerup', () => this.chooser.confirm());

    this.time.delayedCall(500, () => this.askNext());
  }

  askNext() {
    const q = SURVEY[this.step];
    const go = () => this.chooser.ask(q, (value) => this.answer(q.key, value));
    if (q.pause) this.time.delayedCall(q.pause, go);
    else go();
  }

  answer(key, value) {
    this.answers[key] = value;
    this.step += 1;

    this.chooser.fadeOut(260, () => {
      if (this.step < SURVEY.length) {
        this.time.delayedCall(180, () => this.askNext());
      } else {
        this.finish();
      }
    });
  }

  finish() {
    const survey = this.answers;
    this.registry.set('survey', survey);

    // 발사만 하고 기다리지 않는다. 방에서 결과를 받는다.
    const casting = isComplete(survey)
      ? fetch('/api/agent/casting', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ survey }),
      })
        .then((r) => r.json())
        .then((o) => (o.error ? { error: o.error } : o.data))
        .catch((e) => ({ error: e.message }))
      : Promise.resolve({ error: '설문 미완료' });

    this.registry.set('casting', casting);

    if (this.skip) { this.chooser.destroy(); this.scene.start('room'); return; }

    // 눈을 뜨는 한 박자
    const fade = this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0, 0).setDepth(500).setAlpha(0);
    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 700,
      onComplete: () => {
        this.chooser.destroy();
        this.askPhoto();
      },
    });
  }

  /**
   * Act 0 — 방 사진. **여기가 이 게임의 첫 약속이다.**
   * 건너뛸 수 있다 — 카메라가 없거나, 보여주기 싫거나, 그냥 게임만 보고 싶을 수 있다.
   */
  askPhoto() {
    const go = (vision) => this.scene.start('room', vision ? { vision } : {});
    new RoomPhoto(go, () => go(null)).show();
  }
}
