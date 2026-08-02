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

// ── 사물의 생김새 ────────────────────────────────────────────
//
// 예전에는 전부 **같은 네모**였다. 색만 다른 상자가 열두 개 놓여 있으면
// 무엇이 의자고 무엇이 냉장고인지 라벨을 읽어야 안다 — 그 순간 화면을 안 보게 된다.
//
// 타일이 32px뿐이라 디테일을 넣을 자리가 없다. 그래서 **실루엣 하나만** 맞춘다:
// 의자는 등받이와 다리, 책상은 상판 밑의 빈 공간, 나무는 기둥과 우듬지.
// 멀리서 봐도 뭔지 알면 그걸로 됐다 (ART.md §2 — 정면 스프라이트).
//
// 같은 type도 공간에 따라 다르게 그린다. 공원의 chair는 벤치고,
// 골목의 lamp는 가로등이다. 맵 스키마를 늘리지 않고 결을 바꾸는 가장 싼 방법이다.

/** 윗면이 밝고 아랫단이 어두운 상자 하나. 거의 모든 가구의 뼈대 */
function slab(g, x, y, w, h, c, faceRatio = 0.28) {
  const face = Math.max(1, Math.round(h * faceRatio));
  g.fillStyle(c).fillRect(x, y, w, h);
  g.fillStyle(lighten(c, 0.18)).fillRect(x, y, w, face);
  g.fillStyle(darken(c, 0.3)).fillRect(x, y + h - 1, w, 1);
  g.lineStyle(1, P.line).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** 다리 — 가구가 바닥에서 떠 있게 보이는 유일한 단서 */
function legs(g, x, y, w, h, c, thick = 3) {
  g.fillStyle(darken(c, 0.45));
  g.fillRect(x + 1, y, thick, h).fillRect(x + w - thick - 1, y, thick, h);
}

const SHAPES = {
  chair(g, pw, ph, c, { theme }) {
    if (theme === 'park' || theme === 'street') {         // 벤치 — 옆으로 길고 낮다
      const seatY = ph - 12;
      slab(g, 1, seatY - 10, pw - 2, 4, darken(c, 0.1));   // 등받이
      g.fillStyle(darken(c, 0.4)).fillRect(3, seatY - 8, 2, 8).fillRect(pw - 5, seatY - 8, 2, 8);
      slab(g, 0, seatY, pw, 6, c);                          // 앉는 판
      g.fillStyle(darken(c, 0.25)).fillRect(0, seatY + 2, pw, 1);
      legs(g, 2, seatY + 6, pw - 4, 6, c, 3);
      return;
    }
    const seatY = Math.round(ph * 0.52);
    slab(g, 6, 2, pw - 12, seatY - 4, darken(c, 0.08));     // 등받이
    g.fillStyle(darken(c, 0.35)).fillRect(9, 6, pw - 18, 2).fillRect(9, seatY - 8, pw - 18, 2);
    slab(g, 2, seatY, pw - 4, 6, c);                        // 앉는 판
    legs(g, 3, seatY + 6, pw - 6, ph - seatY - 7, c);
  },

  table(g, pw, ph, c) {
    const top = Math.max(4, Math.round(ph * 0.3));
    slab(g, 0, 0, pw, top, c);                              // 상판
    legs(g, 2, top, pw - 4, ph - top - 1, c, 4);
    g.fillStyle(darken(c, 0.5)).fillRect(0, ph - 2, pw, 2); // 바닥 그림자
  },

  desk(g, pw, ph, c) {
    const top = Math.max(5, Math.round(ph * 0.3));
    slab(g, 0, 0, pw, top, c);                              // 상판
    const drawerW = Math.min(16, Math.round(pw * 0.4));     // 한쪽에 서랍장
    slab(g, pw - drawerW - 2, top, drawerW, ph - top - 1, darken(c, 0.14));
    g.fillStyle(P.hi);
    for (let i = 1; i <= 2; i++) {
      const y = top + Math.round((ph - top) * i / 3);
      g.fillRect(pw - drawerW + 2, y, drawerW - 8, 1);      // 서랍 손잡이
    }
    g.fillStyle(darken(c, 0.5)).fillRect(3, top, 4, ph - top - 1);   // 반대쪽 다리
    g.fillStyle(darken(c, 0.35)).fillRect(0, ph - 2, pw, 2);
  },

  shelf(g, pw, ph, c, { theme }) {
    // 편의점 매대는 **철제 곤돌라**다. 나무 책장 색 그대로 두면 남의 집 서재처럼 보인다
    const store = theme === 'store';
    const frame = store ? 0x9aa2a6 : c;
    slab(g, 0, 0, pw, ph, darken(frame, 0.18), 0.1);
    const rows = ph > 40 ? 4 : 3;
    for (let i = 0; i < rows; i++) {
      const y = 3 + Math.round((ph - 8) * i / rows);
      g.fillStyle(darken(frame, store ? 0.35 : 0.5)).fillRect(2, y + 9, pw - 4, 2);   // 선반 널
      // 편의점은 상품, 집은 책 — 같은 선반이 다른 곳이 된다
      const goods = store
        ? [0xb8524a, 0xd8b45c, 0x5f8fb0, 0x7fae6a]
        : [0x8a6a5a, 0x6a7a8a, 0xa08a5c, 0x7a6a80];
      for (let x = 3; x < pw - 5; x += 5) {
        g.fillStyle(goods[(x + i) % goods.length]);
        const hh = store ? 7 : 5 + ((x + i) % 3);
        g.fillRect(x, y + 9 - hh, 4, hh);
      }
    }
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  wardrobe(g, pw, ph, c) {
    slab(g, 0, 0, pw, ph, c, 0.08);
    g.fillStyle(darken(c, 0.4)).fillRect(pw / 2 - 1, 3, 2, ph - 6);   // 문 사이 틈
    g.fillStyle(P.hi).fillRect(pw / 2 - 6, ph / 2, 3, 6).fillRect(pw / 2 + 4, ph / 2, 3, 6);
    g.fillStyle(darken(c, 0.25)).fillRect(2, 2, pw - 4, 1);
  },

  drawer(g, pw, ph, c, { theme }) {
    slab(g, 0, 0, pw, ph, c, 0.12);
    if (theme === 'store') {                                 // 계산대 — 위에 단말기
      g.fillStyle(0x2f3238).fillRect(pw / 2 - 7, -1, 14, 9);
      g.fillStyle(0x86c8a0).fillRect(pw / 2 - 5, 1, 10, 5);
      g.fillStyle(P.line).fillRect(0, 8, pw, 1);
      return;
    }
    for (let i = 0; i < 3; i++) {
      const y = 4 + Math.round((ph - 8) * i / 3);
      g.fillStyle(darken(c, 0.35)).fillRect(3, y, pw - 6, 1);
      g.fillStyle(P.hi).fillRect(pw / 2 - 4, y + 4, 8, 1);   // 손잡이
    }
  },

  fridge(g, pw, ph, c) {
    slab(g, 0, 0, pw, ph, c, 0.06);
    g.fillStyle(darken(c, 0.35)).fillRect(2, Math.round(ph * 0.38), pw - 4, 2);  // 냉장/냉동 경계
    g.fillStyle(darken(c, 0.5)).fillRect(pw - 7, 6, 2, 10).fillRect(pw - 7, Math.round(ph * 0.5), 2, 10);
    g.fillStyle(P.hi).fillRect(2, 2, pw - 4, 1);
  },

  sink(g, pw, ph, c) {
    slab(g, 0, ph * 0.3, pw, ph * 0.7, c, 0.12);
    g.fillStyle(darken(c, 0.5)).fillRect(4, Math.round(ph * 0.3), pw - 8, 5);    // 개수대 구멍
    g.fillStyle(P.hi).fillRect(pw / 2 - 1, Math.round(ph * 0.3) - 8, 2, 8)       // 수도꼭지
      .fillRect(pw / 2 - 1, Math.round(ph * 0.3) - 8, 6, 2);
  },

  tv(g, pw, ph, c) {
    const scr = Math.round(ph * 0.68);
    g.fillStyle(0x1a1d22).fillRect(0, 0, pw, scr);
    g.fillStyle(c).fillRect(2, 2, pw - 4, scr - 4);
    g.fillStyle(lighten(c, 0.5), 0.5).fillRect(3, 3, pw - 6, 3);      // 화면 반사
    g.fillStyle(0x2a2e34).fillRect(pw / 2 - 3, scr, 6, 4);            // 목
    g.fillStyle(0x33383f).fillRect(pw / 2 - 9, scr + 4, 18, 3);       // 받침
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, scr - 1);
  },

  monitor(g, pw, ph, c) {
    const scr = Math.round(ph * 0.6);
    g.fillStyle(0x1a1d22).fillRect(1, 0, pw - 2, scr);
    g.fillStyle(c).fillRect(3, 2, pw - 6, scr - 4);
    g.fillStyle(lighten(c, 0.6), 0.4).fillRect(4, 3, pw - 8, 2);
    g.fillStyle(0x2a2e34).fillRect(pw / 2 - 2, scr, 4, 5);
    g.fillStyle(0x33383f).fillRect(pw / 2 - 7, scr + 5, 14, 2);
    g.lineStyle(1, P.line).strokeRect(1.5, 0.5, pw - 3, scr - 1);
  },

  pc(g, pw, ph, c) {
    slab(g, 3, 0, pw - 6, ph, c, 0.06);
    g.fillStyle(darken(c, 0.6));
    for (let y = 5; y < ph * 0.5; y += 3) g.fillRect(6, y, pw - 12, 1);   // 통풍구
    g.fillStyle(0x6ad0a0).fillRect(pw - 10, ph - 8, 2, 2);                // 전원 등
  },

  plant(g, pw, ph, c, { theme }) {
    if (theme === 'park' || theme === 'street') {            // 나무
      const trunk = 0x5a4634;
      const cx = Math.round(pw / 2);
      const trunkH = Math.max(8, Math.round(ph * 0.28));
      g.fillStyle(trunk).fillRect(cx - 3, ph - trunkH, 6, trunkH);
      g.fillStyle(darken(trunk, 0.35)).fillRect(cx - 3, ph - trunkH, 2, trunkH);

      // 우듬지는 **한 덩어리 네모가 아니다.** 폭이 다른 층을 쌓아 위아래를 좁힌다 —
      // 그것만으로 '나무'로 읽힌다. 32px에서 이보다 더 넣을 자리는 없다
      const leaf = 0x4e6b42;
      const top = 1;
      const crownH = ph - trunkH - top + 2;
      const rows = [0.52, 0.78, 1.0, 1.0, 0.86, 0.6];
      const rowH = Math.max(1, Math.round(crownH / rows.length));
      rows.forEach((k, i) => {
        const w = Math.max(4, Math.round((pw - 2) * k));
        const y = top + i * rowH;
        g.fillStyle(i < 2 ? lighten(leaf, 0.12) : i > 3 ? darken(leaf, 0.22) : leaf);
        g.fillRect(Math.round((pw - w) / 2), y, w, rowH + 1);
      });
      // 잎 사이 빛 — 큰 사각형 하나를 박으면 스티커처럼 보인다. 잘게 흩는다
      g.fillStyle(lighten(leaf, 0.3));
      for (const [dx, dy] of [[-8, 3], [4, 6], [-2, 10], [9, 12]]) {
        g.fillRect(cx + dx, top + dy, 2, 2);
      }
      return;
    }
    const potH = Math.max(6, Math.round(ph * 0.32));         // 화분
    g.fillStyle(0x8a5a44).fillRect(4, ph - potH, pw - 8, potH);
    g.fillStyle(lighten(0x8a5a44, 0.2)).fillRect(3, ph - potH, pw - 6, 3);
    g.fillStyle(c).fillRect(6, 2, pw - 12, ph - potH - 2)
      .fillRect(2, 6, pw - 4, ph - potH - 10);
    g.fillStyle(lighten(c, 0.3)).fillRect(8, 4, 4, 6);
    g.lineStyle(1, P.line).strokeRect(4.5, ph - potH + 0.5, pw - 9, potH - 1);
  },

  lamp(g, pw, ph, c, { theme }) {
    if (theme === 'park' || theme === 'street') {            // 가로등
      const pole = 0x4a4a50;
      g.fillStyle(pole).fillRect(pw / 2 - 2, 8, 4, ph - 10);
      g.fillStyle(darken(pole, 0.35)).fillRect(pw / 2 - 2, 8, 1, ph - 10);
      g.fillStyle(pole).fillRect(pw / 2 - 7, 4, 14, 5);      // 등갓
      g.fillStyle(0xffe9a8).fillRect(pw / 2 - 5, 9, 10, 3);  // 불빛
      g.fillStyle(0xffe9a8, 0.18).fillRect(pw / 2 - 9, 11, 18, 8);
      g.fillStyle(darken(pole, 0.5)).fillRect(pw / 2 - 5, ph - 3, 10, 3);
      return;
    }
    const shadeH = Math.max(6, Math.round(ph * 0.3));        // 스탠드
    g.fillStyle(c).fillRect(3, 0, pw - 6, shadeH);
    g.fillStyle(lighten(c, 0.3)).fillRect(5, 1, pw - 10, 2);
    g.fillStyle(0xffe9a8, 0.5).fillRect(4, shadeH, pw - 8, 3);
    g.fillStyle(0x5a5348).fillRect(pw / 2 - 1, shadeH, 2, ph - shadeH - 3);
    g.fillStyle(0x4a443c).fillRect(pw / 2 - 6, ph - 3, 12, 3);
    g.lineStyle(1, P.line).strokeRect(3.5, 0.5, pw - 7, shadeH - 1);
  },

  rug(g, pw, ph, c) {
    g.fillStyle(c).fillRect(1, 1, pw - 2, ph - 2);
    g.fillStyle(darken(c, 0.25)).fillRect(3, 3, pw - 6, ph - 6);
    g.fillStyle(c).fillRect(5, 5, pw - 10, ph - 10);
    g.fillStyle(lighten(c, 0.2));                             // 술
    for (let x = 2; x < pw - 2; x += 4) g.fillRect(x, 0, 2, 1).fillRect(x, ph - 1, 2, 1);
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  trash_pile(g, pw, ph, c) {
    g.fillStyle(darken(c, 0.15)).fillRect(2, ph - 9, pw - 4, 9);       // 봉지
    g.fillStyle(c).fillRect(4, ph - 14, pw - 9, 7);
    g.fillStyle(lighten(c, 0.2)).fillRect(6, ph - 16, 5, 4).fillRect(pw - 12, ph - 13, 6, 3);
    g.fillStyle(darken(c, 0.4)).fillRect(pw / 2 - 3, ph - 18, 3, 5);   // 삐져나온 것
    g.fillStyle(P.line).fillRect(1, ph - 1, pw - 2, 1);
  },

  clothes_pile(g, pw, ph, c) {
    g.fillStyle(darken(c, 0.2)).fillRect(1, ph - 8, pw - 2, 8);
    g.fillStyle(c).fillRect(4, ph - 13, pw - 8, 7);
    g.fillStyle(lighten(c, 0.18)).fillRect(7, ph - 16, pw - 15, 5);
    g.fillStyle(darken(c, 0.35)).fillRect(3, ph - 6, 7, 2).fillRect(pw - 12, ph - 10, 8, 2);
    g.fillStyle(P.line).fillRect(1, ph - 1, pw - 2, 1);
  },

  box(g, pw, ph, c) {
    slab(g, 1, 0, pw - 2, ph, c, 0.2);
    g.fillStyle(darken(c, 0.3)).fillRect(pw / 2 - 1, 0, 2, ph);         // 테이프
    g.fillStyle(lighten(c, 0.25)).fillRect(2, Math.round(ph * 0.2), pw - 4, 1);
  },

  laundry_basket(g, pw, ph, c) {
    g.fillStyle(0xd8cfc0).fillRect(5, 1, pw - 10, 6);                   // 삐져나온 빨래
    slab(g, 2, 5, pw - 4, ph - 5, c, 0.14);
    g.fillStyle(darken(c, 0.35));
    for (let x = 5; x < pw - 4; x += 4) g.fillRect(x, 8, 1, ph - 10);   // 바구니 살
    g.fillStyle(lighten(c, 0.2)).fillRect(2, 5, pw - 4, 2);
  },

  cup(g, pw, ph, c) {
    const w = Math.min(11, pw - 4);
    const x = Math.round((pw - w) / 2);
    g.fillStyle(c).fillRect(x, ph - 12, w, 12);
    g.fillStyle(lighten(c, 0.22)).fillRect(x, ph - 12, w, 3);
    g.fillStyle(0x4a3a2e).fillRect(x + 2, ph - 11, w - 4, 2);           // 남은 것
    g.fillStyle(c).fillRect(x + w, ph - 9, 3, 2).fillRect(x + w + 1, ph - 8, 2, 4)
      .fillRect(x + w, ph - 5, 3, 2);                                   // 손잡이
    g.lineStyle(1, P.line).strokeRect(x + 0.5, ph - 12.5, w - 1, 12);
  },

  bottle(g, pw, ph, c) {
    const x = Math.round(pw / 2);
    g.fillStyle(c).fillRect(x - 4, ph - 13, 8, 13);
    g.fillStyle(c).fillRect(x - 2, ph - 18, 4, 6);                      // 목
    g.fillStyle(darken(c, 0.4)).fillRect(x - 2, ph - 20, 4, 2);         // 뚜껑
    g.fillStyle(lighten(c, 0.35)).fillRect(x - 3, ph - 12, 2, 10);      // 빛
    g.lineStyle(1, P.line).strokeRect(x - 4.5, ph - 13.5, 9, 13);
  },

  book_stack(g, pw, ph, c) {
    const cols = [c, darken(c, 0.25), lighten(c, 0.2)];
    for (let i = 0; i < 3; i++) {
      const y = ph - 5 - i * 4;
      const off = i % 2 ? 2 : 0;
      g.fillStyle(cols[i]).fillRect(3 + off, y, pw - 8, 4);
      g.fillStyle(darken(cols[i], 0.4)).fillRect(3 + off, y, pw - 8, 1);
      g.lineStyle(1, P.line).strokeRect(3.5 + off, y + 0.5, pw - 9, 3);
    }
  },

  mirror(g, pw, ph, c) {
    g.fillStyle(0x5a4f42).fillRect(0, 0, pw, ph);
    g.fillStyle(c).fillRect(3, 3, pw - 6, ph - 6);
    g.fillStyle(lighten(c, 0.3), 0.7).fillRect(4, 4, Math.max(3, (pw - 8) / 3), ph - 8);
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  poster(g, pw, ph, c) {
    g.fillStyle(c).fillRect(1, 1, pw - 2, ph - 2);
    g.fillStyle(darken(c, 0.35)).fillRect(4, 4, pw - 8, Math.round(ph * 0.45));
    g.fillStyle(lighten(c, 0.25));
    for (let i = 0; i < 3; i++) g.fillRect(4, Math.round(ph * 0.6) + i * 4, pw - 10 - i * 3, 2);
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  clock(g, pw, ph, c) {
    const r = Math.min(pw, ph) / 2 - 1;
    const cx = pw / 2;
    const cy = ph / 2;
    g.fillStyle(darken(c, 0.4)).fillCircle(cx, cy, r);
    g.fillStyle(lighten(c, 0.3)).fillCircle(cx, cy, r - 2);
    g.fillStyle(P.line).fillRect(cx - 1, cy - r + 4, 2, r - 4).fillRect(cx, cy, r - 5, 2);
  },

  photo(g, pw, ph, c) {
    g.fillStyle(c).fillRect(0, 0, pw, ph);
    g.fillStyle(0xd8cfc0).fillRect(2, 2, pw - 4, ph - 4);
    g.fillStyle(0x8a9aa8).fillRect(3, 3, pw - 6, Math.round(ph * 0.5));
    g.fillStyle(0x5a5048).fillRect(pw / 2 - 2, ph / 2 - 2, 4, 5);        // 사람 하나
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  calendar(g, pw, ph, c) {
    g.fillStyle(0xd8cfc0).fillRect(0, 0, pw, ph);
    g.fillStyle(darken(c, 0.2)).fillRect(0, 0, pw, Math.max(3, ph * 0.22));
    g.fillStyle(0x8a7c6b);
    for (let y = Math.round(ph * 0.32); y < ph - 2; y += 4) {
      for (let x = 2; x < pw - 2; x += 4) g.fillRect(x, y, 2, 2);
    }
    g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
  },

  fan(g, pw, ph, c) {
    const r = Math.min(pw, Math.round(ph * 0.55)) / 2 - 1;
    const cx = pw / 2;
    g.fillStyle(darken(c, 0.3)).fillCircle(cx, r + 2, r);
    g.fillStyle(lighten(c, 0.2)).fillCircle(cx, r + 2, r - 2);
    g.fillStyle(darken(c, 0.45)).fillRect(cx - 1, r + 2 - r + 2, 2, r * 2 - 4)
      .fillRect(cx - r + 2, r + 1, r * 2 - 4, 2);
    g.fillStyle(0x5a5348).fillRect(cx - 1, r * 2, 2, ph - r * 2 - 3);
    g.fillStyle(0x4a443c).fillRect(cx - 6, ph - 3, 12, 3);
  },

  aircon(g, pw, ph, c) {
    slab(g, 0, 0, pw, ph, c, 0.35);
    g.fillStyle(darken(c, 0.3));
    for (let y = Math.round(ph * 0.45); y < ph - 2; y += 3) g.fillRect(3, y, pw - 6, 1);
    g.fillStyle(0x6ad0a0).fillRect(pw - 7, 3, 2, 2);
  },

  console(g, pw, ph, c) {
    slab(g, 0, 0, pw, ph, c, 0.25);
    g.fillStyle(darken(c, 0.4)).fillRect(3, Math.round(ph * 0.5), pw - 6, 1);
    g.fillStyle(P.hi).fillRect(4, Math.round(ph * 0.7), 6, 1).fillRect(pw - 10, Math.round(ph * 0.7), 6, 1);
  },
};

/**
 * 오브젝트 텍스처. (type, 타일 폭, 타일 높이, 벽 부착 여부, 공간의 결)마다 하나.
 * 원점은 좌하단 — footprint 아래쪽이 격자에 붙고 나머지는 위로 자란다.
 */
export function objectTexture(scene, type, w, h, onWall, wallSide, variant = '', theme = 'indoor') {
  const key = `obj:${type}:${w}x${h}:${onWall ? wallSide : 'floor'}:${variant}:${theme}`;
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
      // 이 게임에서 제일 자주 보는 물건이다 — 하루가 여기서 시작하고 여기서 끝난다.
      // 예전에는 색만 다른 큰 판이었다. 머리맡(베개)·이불 끝단·매트리스를 나눠 그린다.
      const frame = darken(c, 0.45);
      const made = variant === 'made';
      const sheet = made ? lighten(c, 0.28) : c;
      const pillowH = Math.max(7, Math.round(ph * 0.2));
      const headH = Math.max(3, Math.round(ph * 0.06));

      g.fillStyle(frame).fillRect(0, 0, pw, ph);                    // 프레임
      g.fillStyle(darken(frame, 0.3)).fillRect(0, 0, pw, headH);    // 머리판
      g.fillStyle(0xd8cfc0).fillRect(3, headH + 1, pw - 6, pillowH); // 베개
      g.fillStyle(darken(0xd8cfc0, 0.15)).fillRect(3, headH + pillowH - 1, pw - 6, 2);

      const bTop = headH + pillowH + 2;                              // 이불이 덮는 자리
      g.fillStyle(sheet).fillRect(2, bTop, pw - 4, ph - bTop - 2);

      if (made) {
        // 각 잡아 접은 끝단 — 개어져 있다는 걸 한눈에
        g.fillStyle(lighten(sheet, 0.35)).fillRect(2, bTop, pw - 4, 3);
        g.fillStyle(darken(sheet, 0.2)).fillRect(2, bTop + 3, pw - 4, 1);
        for (let x = 6; x < pw - 6; x += 9) {
          g.fillStyle(darken(sheet, 0.12)).fillRect(x, bTop + 6, 1, ph - bTop - 9);
        }
      } else {
        // 헝클어짐 — 덩어리진 주름. 위치를 폭에 비례시켜 어떤 크기에서도 채워진다
        g.fillStyle(darken(sheet, 0.3));
        const h = ph - bTop - 3;
        for (const [kx, ky, kw, kh] of [[0.08, 0.05, 0.5, 0.3], [0.45, 0.4, 0.45, 0.25], [0.15, 0.66, 0.6, 0.24]]) {
          g.fillRect(2 + Math.round((pw - 4) * kx), bTop + Math.round(h * ky),
            Math.round((pw - 4) * kw), Math.max(2, Math.round(h * kh)));
        }
        g.fillStyle(lighten(sheet, 0.18));
        g.fillRect(2 + Math.round((pw - 4) * 0.55), bTop + Math.round(h * 0.12),
          Math.round((pw - 4) * 0.3), Math.max(2, Math.round(h * 0.18)));
        g.fillStyle(sheet).fillRect(pw - 8, bTop + 2, 6, 4);          // 흘러내린 자락
      }
      g.fillStyle(darken(frame, 0.2)).fillRect(0, ph - 2, pw, 2);
      g.lineStyle(1, P.line).strokeRect(0.5, 0.5, pw - 1, ph - 1);
      return;
    }
    // 생김새가 정해진 것은 그대로 그린다. 없으면 예전처럼 상자 —
    // 새 type이 들어와도 화면이 비지는 않는다
    const shape = SHAPES[type];
    if (shape) {
      shape(g, pw, ph, c, { theme, variant, onWall, wallSide });
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
