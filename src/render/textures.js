// 플레이스홀더 텍스처를 런타임에 생성한다.
// 타일셋을 구하면 이 파일만 로더로 교체하고 씬은 그대로 둔다 (ART.md §6).

export const TILE = 32;
export const ZOOM = 2;
export const WALL_TOP_H = TILE * 2;  // 위쪽 벽은 화면상 2타일 (ART.md §1)
export const ROOM_TOP = TILE;        // 그만큼 방을 아래로 민다

// 저채도 실내 톤 (ART.md §4)
const P = {
  floor: 0x6b5d4f, floorSeam: 0x5d5044, floorDot: 0x74665a,
  wall: 0x3b342e, wallFace: 0x4a4239, wallTrim: 0x2b2622,
  line: 0x1a1714, hi: 0x8a7c6b,
};

/**
 * 공간의 결. 어디를 가든 같은 마루·같은 벽이면 밖에 나온 느낌이 안 난다.
 *
 * `seam`  타일 경계선 — 실내는 마루 이음매, 밖은 보도블록 줄눈, 공원은 거의 없음
 * `dots`  바닥에 흩뿌리는 점 (고정 좌표. 랜덤이면 방을 다시 만들 때 무늬가 튄다)
 * `wall`  좌·우·아래 벽 / `face` 위쪽 벽면 / `trim` 그 아래 굽도리
 *
 * 새 공간 = 여기 한 항목 + `maps.js`의 `theme`. 그게 전부다.
 */
export const THEMES = {
  // 집 안 — 마루. 기본값
  indoor: {
    floor: 0x6b5d4f, seam: 0x5d5044, dot: 0x74665a, dots: 5,
    wall: 0x3b342e, face: 0x4a4239, trim: 0x2b2622, hi: 0x8a7c6b,
  },
  // 골목 — 젖은 아스팔트. 줄눈이 뚜렷하고 벽은 담벼락
  street: {
    floor: 0x4a4a4e, seam: 0x3a3a3f, dot: 0x55555a, dots: 3,
    wall: 0x53504a, face: 0x625e56, trim: 0x3a3833, hi: 0x7d786d,
  },
  // 공원 — 잔디. 이음매를 지우고 점을 뿌려 풀결을 만든다
  park: {
    floor: 0x4c5c41, seam: 0x4c5c41, dot: 0x5d7050, dots: 14,
    wall: 0x3e4a38, face: 0x4a5a42, trim: 0x2e382a, hi: 0x6d8060,
  },
  // 편의점 — 흰 장판에 형광등. 유일하게 밝고 채도가 낮다
  store: {
    floor: 0x9a9890, seam: 0x86847d, dot: 0xa5a39b, dots: 2,
    wall: 0x7d8a8d, face: 0x94a0a2, trim: 0x5f6a6c, hi: 0xc2ccca,
  },
};
export const THEME_LIST = Object.keys(THEMES);

// 고정 노이즈. 랜덤을 쓰면 방을 다시 만들 때 무늬가 튄다.
const DOTS = [
  [5, 8], [19, 4], [11, 21], [26, 14], [3, 27], [22, 25], [14, 11],
  [8, 17], [29, 6], [17, 29], [1, 13], [24, 19], [12, 2], [7, 23],
];

const OBJ = {
  bed: 0x7a4a4a, desk: 0x7a6242, chair: 0x5f4c38, wardrobe: 0x6b5340,
  shelf: 0x6f5942, drawer: 0x705a44, table: 0x75604a,
  monitor: 0x3a4048, pc: 0x34383e, tv: 0x33383f, console: 0x3e4450,
  fan: 0x6a6a68, aircon: 0x8a8d8a,
  window: 0x6f8ba0, door: 0x8a6a3f, curtain: 0x7d6a72,
  rug: 0x6a5560, clothes_pile: 0x7b6f5a, trash_pile: 0x59564a,
  box: 0x7d6a4e, laundry_basket: 0x6d6552,
  cup: 0x8e8a80, bottle: 0x5d7060, book_stack: 0x6e5a52,
  plant: 0x4f6b4a, poster: 0x7a6a70, mirror: 0x8090a0, lamp: 0x96874f,
  phone: 0x2b2f36,
  // 살림 — 볼 것들
  fridge: 0x9aa0a4, sink: 0x7d858a, photo: 0x8a7a62, clock: 0x8e8778, calendar: 0x8d8470,
};

// 발밑 footprint보다 위로 더 그리는 높이 (타일 단위).
// 정면성을 만드는 값 — 옷장은 서 있고 러그는 누워 있다.
const TALL = {
  wardrobe: 1, shelf: 1, drawer: 0.5, table: 0.25, desk: 0.25, chair: 0.5, bed: 0.25,
  monitor: 0.5, pc: 0.5, tv: 0.5, console: 0.25, fan: 0.75, plant: 0.5, lamp: 0.75,
  bottle: 0.25, book_stack: 0.25, box: 0.25, laundry_basket: 0.25,
  rug: 0, clothes_pile: 0, trash_pile: 0, cup: 0,
  fridge: 1, sink: 0.5,
};

export const objectColor = (type) => OBJ[type] ?? 0x6a6a6a;
export const tallBonus = (type) => TALL[type] ?? 0;

function tex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ add: false });
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** 한 공간의 바닥·벽 세 장. 키에 테마를 붙여 공간마다 다른 결을 쓴다. */
function buildTheme(scene, name) {
  const t = THEMES[name] ?? THEMES.indoor;
  const grass = name === 'park';

  tex(scene, `floor:${name}`, TILE, TILE, (g) => {
    g.fillStyle(t.floor).fillRect(0, 0, TILE, TILE);
    // 잔디는 이음매가 없다 — 격자가 보이면 그 순간 실내가 된다
    if (!grass) {
      g.fillStyle(t.seam).fillRect(0, TILE - 1, TILE, 1).fillRect(TILE - 1, 0, 1, TILE);
    }
    g.fillStyle(t.dot);
    for (const [x, y] of DOTS.slice(0, t.dots)) {
      if (grass) g.fillRect(x, y, 1, 2);      // 세로로 한 칸 더 — 풀결
      else g.fillRect(x, y, 1, 1);
    }
  });

  // 좌·우·아래 벽: 한 타일
  tex(scene, `wall:${name}`, TILE, TILE, (g) => {
    g.fillStyle(t.wall).fillRect(0, 0, TILE, TILE);
    g.fillStyle(t.trim).fillRect(0, 0, TILE, 3);
    g.fillStyle(P.line).fillRect(0, TILE - 1, TILE, 1);
  });

  // 위쪽 벽: 두 타일 — 벽면이 카메라를 향해 서 있다
  tex(scene, `wallTop:${name}`, TILE, WALL_TOP_H, (g) => {
    g.fillStyle(t.face).fillRect(0, 0, TILE, WALL_TOP_H - 5);
    g.fillStyle(t.hi).fillRect(0, 0, TILE, 1);
    // 담벼락은 벽돌 줄, 편의점은 선반 띠. 밋밋한 면이면 안이나 밖이나 똑같다
    if (name === 'street') {
      g.fillStyle(t.trim).fillRect(0, 16, TILE, 1).fillRect(0, 32, TILE, 1);
      g.fillStyle(t.wall).fillRect(15, 0, 2, 16).fillRect(0, 16, 2, 16);
    } else if (name === 'store') {
      g.fillStyle(t.hi).fillRect(2, 14, TILE - 4, 2).fillRect(2, 34, TILE - 4, 2);
    } else if (grass) {
      g.fillStyle(t.hi);
      for (const [x, y] of DOTS.slice(0, 8)) g.fillRect(x, (y * 2) % (WALL_TOP_H - 8), 1, 3);
    }
    g.fillStyle(t.trim).fillRect(0, WALL_TOP_H - 5, TILE, 5);
    g.fillStyle(P.line).fillRect(0, WALL_TOP_H - 1, TILE, 1);
  });
}

/** 바닥 · 벽 · 플레이어. 방마다 바뀌지 않으므로 한 번만. */
export function buildBaseTextures(scene) {
  for (const name of THEME_LIST) buildTheme(scene, name);
  buildPlayer(scene);
  buildProps(scene);
}

/**
 * 무대 프롭 — 디렉터가 매일 놓는 것들. 사진에서 올 수 없으므로 별도 레이어다.
 * 정체는 매일 달라지므로 **그리기 힌트 세 가지**만 둔다. 이름은 라벨이 말해준다.
 */
export const PROP_LOOKS = ['person', 'animal', 'object'];

function buildProps(scene) {
  // 사람 — 플레이어와 구분되게 옷 색만 다르다
  tex(scene, 'prop-person', PW, PH, (g) => {
    const skin = 0xbca894, hair = 0x332c26, cloth = 0x6b5a63;
    g.fillStyle(skin).fillRect(11, 8, 10, 12);
    g.fillStyle(hair).fillRect(9, 4, 14, 8).fillRect(9, 6, 2, 9).fillRect(21, 6, 2, 9);
    g.fillStyle(cloth).fillRect(8, 20, 16, 17);
    g.fillStyle(darken(cloth, 0.22)).fillRect(6, 21, 3, 13).fillRect(23, 21, 3, 13);
    g.fillStyle(0x3c4450).fillRect(10, 37, 5, 8).fillRect(17, 37, 5, 8);
    g.fillStyle(0x2f2b28).fillRect(10, 45, 5, 3).fillRect(17, 45, 5, 3);
    g.fillStyle(P.line).fillRect(13, 13, 2, 2).fillRect(18, 13, 2, 2).fillRect(8, 47, 16, 1);
  });

  // 동물 — 낮고 옆으로 길다
  tex(scene, 'prop-animal', PW, 22, (g) => {
    const body = 0x6e6157;
    g.fillStyle(body).fillRect(6, 8, 18, 10);
    g.fillStyle(body).fillRect(20, 4, 8, 7);                 // 머리
    g.fillStyle(darken(body, 0.3)).fillRect(4, 9, 4, 3);     // 꼬리
    g.fillStyle(0x2f2b28).fillRect(8, 18, 3, 3).fillRect(13, 18, 3, 3).fillRect(19, 18, 3, 3);
    g.fillStyle(P.line).fillRect(25, 6, 2, 2).fillRect(6, 21, 18, 1);
  });

  // 사물 — 바닥에 놓인 작은 것
  tex(scene, 'prop-object', PW, 20, (g) => {
    const c = 0x7d6a4e;
    g.fillStyle(c).fillRect(8, 6, 16, 13);
    g.fillStyle(lighten(c, 0.2)).fillRect(8, 6, 16, 4);
    g.fillStyle(darken(c, 0.3)).fillRect(8, 17, 16, 2);
    g.lineStyle(1, P.line).strokeRect(8.5, 6.5, 15, 13);
    g.fillStyle(P.line).fillRect(8, 19, 16, 1);
  });
}

// 폭 1타일 × 높이 1.5타일. 발밑 1타일이 점유 칸 (ART.md §2)
const PW = TILE, PH = TILE * 1.5;
const SKIN = 0xb09a86, HAIR = 0x2b2620, HOOD = 0x4a4750, HOOD_D = 0x3a3840, PANTS = 0x3c4450;

function buildPlayer(scene) {
  const body = (g) => {
    g.fillStyle(HOOD).fillRect(8, 20, 16, 17);          // 후드 몸통
    g.fillStyle(HOOD_D).fillRect(6, 21, 3, 13).fillRect(23, 21, 3, 13); // 팔
    g.fillStyle(PANTS).fillRect(10, 37, 5, 8).fillRect(17, 37, 5, 8);   // 다리
    g.fillStyle(0x232026).fillRect(10, 45, 5, 3).fillRect(17, 45, 5, 3); // 신발
    g.fillStyle(P.line).fillRect(8, 47, 16, 1);          // 접지 그림자
  };

  tex(scene, 'player-front', PW, PH, (g) => {
    g.fillStyle(SKIN).fillRect(11, 8, 10, 12);
    g.fillStyle(HAIR).fillRect(10, 4, 12, 7).fillRect(9, 6, 2, 9).fillRect(21, 6, 2, 9);
    body(g);
    g.fillStyle(P.line).fillRect(13, 13, 2, 2).fillRect(18, 13, 2, 2); // 눈
  });

  tex(scene, 'player-back', PW, PH, (g) => {
    g.fillStyle(HAIR).fillRect(9, 4, 14, 16);
    body(g);
  });

  tex(scene, 'player-side', PW, PH, (g) => {
    g.fillStyle(SKIN).fillRect(12, 8, 9, 12);
    g.fillStyle(HAIR).fillRect(10, 4, 12, 7).fillRect(10, 6, 3, 11);
    g.fillStyle(HOOD).fillRect(10, 20, 12, 17);
    g.fillStyle(HOOD_D).fillRect(13, 21, 4, 13);
    g.fillStyle(PANTS).fillRect(12, 37, 8, 8);
    g.fillStyle(0x232026).fillRect(12, 45, 8, 3);
    g.fillStyle(P.line).fillRect(10, 47, 12, 1).fillRect(18, 13, 2, 2);
  });
}

/**
 * 오브젝트 텍스처. (type, 타일 폭, 타일 높이, 벽 부착 여부)마다 하나.
 * 원점은 좌하단 — footprint 아래쪽이 격자에 붙고 나머지는 위로 자란다.
 */
export function objectTexture(scene, type, w, h, onWall, wallSide, variant = '') {
  const key = `obj:${type}:${w}x${h}:${onWall ? wallSide : 'floor'}:${variant}`;
  const pw = w * TILE;
  const ph = onWall
    ? (wallSide === 'top-wall' ? WALL_TOP_H : h * TILE)
    : Math.round((h + tallBonus(type)) * TILE);

  tex(scene, key, pw, ph, (g) => {
    const c = objectColor(type);
    if (type === 'door') {
      g.fillStyle(0x140f0b).fillRect(0, 0, pw, ph);              // 열린 어둠
      g.fillStyle(c).fillRect(0, 0, 3, ph).fillRect(pw - 3, 0, 3, ph).fillRect(0, 0, pw, 3);
      g.fillStyle(P.hi).fillRect(0, 0, pw, 1);
      return;
    }
    if (type === 'window') {
      const glass = variant === 'open' ? lighten(c, 0.5) : c;
      g.fillStyle(P.wallTrim).fillRect(0, 0, pw, ph);
      g.fillStyle(glass).fillRect(3, 3, pw - 6, ph - 8);
      if (variant === 'open') {
        // 창틀이 한쪽으로 밀려 열린 상태
        g.fillStyle(P.wallTrim).fillRect(pw - 10, 3, 7, ph - 8);
        g.fillStyle(lighten(glass, 0.25)).fillRect(4, 4, pw - 15, ph - 10);
      } else {
        g.fillStyle(P.wallTrim).fillRect(pw / 2 - 1, 3, 2, ph - 8);
      }
      g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
      return;
    }
    if (type === 'curtain') {
      if (variant === 'open') {
        // 양옆으로 걷힌 상태 — 가운데가 뚫린다
        g.fillStyle(0x9fb4c4).fillRect(0, 0, pw, ph);
        g.fillStyle(c).fillRect(0, 0, 6, ph).fillRect(pw - 6, 0, 6, ph);
        g.fillStyle(darken(c, 0.3)).fillRect(5, 0, 1, ph).fillRect(pw - 6, 0, 1, ph);
      } else {
        g.fillStyle(c).fillRect(0, 0, pw, ph);
        g.fillStyle(darken(c, 0.22));
        for (let x = 3; x < pw; x += 6) g.fillRect(x, 0, 2, ph);   // 주름
      }
      g.fillStyle(P.hi).fillRect(0, 0, pw, 2);
      g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
      return;
    }
    if (type === 'phone') {
      // 알림이 있으면 화면이 켜져 있다 (variant 'lit')
      g.fillStyle(0x14171c).fillRect(pw / 2 - 7, ph - 16, 14, 15);
      g.fillStyle(variant === 'lit' ? 0x9fd8ff : 0x3a4048).fillRect(pw / 2 - 5, ph - 14, 10, 11);
      if (variant === 'lit') {
        g.fillStyle(0xffffff, 0.9).fillRect(pw / 2 - 3, ph - 12, 6, 1).fillRect(pw / 2 - 3, ph - 9, 6, 1);
      }
      g.lineStyle(1, P.line).strokeRect(pw / 2 - 7.5, ph - 16.5, 15, 16);
      return;
    }
    if (type === 'bed') {
      const sheet = variant === 'made' ? lighten(c, 0.3) : c;
      g.fillStyle(darken(c, 0.4)).fillRect(0, 0, pw, ph);          // 프레임
      g.fillStyle(sheet).fillRect(2, 4, pw - 4, ph - 6);
      if (variant === 'made') {
        g.fillStyle(0xd8cfc0).fillRect(4, 6, pw - 8, 9);           // 개어놓은 베개
        g.fillStyle(darken(sheet, 0.18)).fillRect(2, ph - 14, pw - 4, 2);
      } else {
        g.fillStyle(darken(sheet, 0.28));                          // 헝클어진 이불
        for (const [x, y, ww, hh] of [[5, 9, 12, 6], [20, 16, 14, 5], [9, 24, 18, 4]]) {
          if (x + ww < pw && y + hh < ph) g.fillRect(x, y, ww, hh);
        }
      }
      g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
      return;
    }
    const face = Math.max(2, Math.round(ph * 0.22));             // 윗면
    g.fillStyle(c).fillRect(0, 0, pw, ph);
    g.fillStyle(lighten(c, 0.18)).fillRect(0, 0, pw, face);
    g.fillStyle(darken(c, 0.25)).fillRect(0, ph - 2, pw, 2);
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
    g.fillStyle(P.line).fillRect(0, face, pw, 1);
  });

  return { key, width: pw, height: ph };
}

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));
function shift(hex, f) {
  const r = clamp255(((hex >> 16) & 255) * f);
  const g = clamp255(((hex >> 8) & 255) * f);
  const b = clamp255((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}
const lighten = (hex, amt) => shift(hex, 1 + amt);
const darken = (hex, amt) => shift(hex, 1 - amt);
