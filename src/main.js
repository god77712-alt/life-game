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
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#14110f',
  // 고정 배율(zoom: 2)이면 폰 화면보다 넓어서 잘린다.
  // FIT은 부모 상자(#game)에 비율을 지켜 맞춘다. 상자 크기는 CSS가 정한다 —
  // 캔버스 크기를 CSS로 덮지 않는다. 덮으면 Phaser가 아는 배율과 실제 크기가 어긋나고,
  // 그 차이가 그대로 터치 좌표 오차가 된다.
  scale: {
    mode: Phaser.Scale.FIT,
    // **가운데 정렬은 CSS에게 맡긴다** (#game이 flex 상자다).
    // Phaser의 autoCenter는 캔버스에 margin을 인라인으로 박는데, 그 값을 한 박자 전
    // 캔버스 크기로 계산해서 실측 -8px씩 왼쪽으로 밀렸다 — 화면 왼쪽이 잘려 보인다.
    autoCenter: Phaser.Scale.NO_CENTER,
    // 이걸 안 끄면 Phaser가 부모에 width/height 100%를 인라인으로 박는다.
    // 그러면 CSS의 max-width가 무시되고 데스크톱에서 캔버스가 화면만큼 커진다.
    expandParent: false,
  },
  // 손가락은 마우스가 아니다. 두 개까지 받는다 (걷기 + 상호작용 동시 입력)
  input: { activePointers: 3 },
  scene: [TitleScene, IntroScene, RoomScene],   // 타이틀 → 설문 → (방 사진) → 방
  callbacks: {
    postBoot: (game) => {
      const room = game.scene.getScene('room');
      mountPhotoInput(room);     // DEV 패널의 사진 입력 (정식 흐름은 IntroScene → RoomPhoto)
      mountDevTools(room);
    },
  },
});
void ZOOM;   // 배율은 이제 Scale Manager가 정한다. 상수는 문서용으로 남긴다
