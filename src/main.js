import { GRID_W, GRID_H } from './room/schema.js';
import { TILE, ZOOM, ROOM_TOP } from './render/textures.js';
import { TitleScene } from './scenes/TitleScene.js';
import { IntroScene } from './scenes/IntroScene.js';
import { RoomScene } from './scenes/RoomScene.js';
import { mountPhotoInput } from './photo.js';
import { mountDevTools } from './devtools.js';

// 디버그 훅 — 콘솔에서 game.scene.getScene('room')으로 상태를 들여다볼 수 있다
window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GRID_W * TILE,                 // 384
  height: ROOM_TOP + GRID_H * TILE,     // 352 — 위쪽 벽 2타일 렌더링분 포함
  zoom: ZOOM,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#14110f',
  scene: [TitleScene, IntroScene, RoomScene],   // 타이틀 → 설문 → (방 사진) → 방
  callbacks: {
    postBoot: (game) => {
      const room = game.scene.getScene('room');
      mountPhotoInput(room);     // DEV 패널의 사진 입력 (정식 흐름은 IntroScene → RoomPhoto)
      mountDevTools(room);
    },
  },
});
