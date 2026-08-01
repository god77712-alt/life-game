// 글자를 손가락으로 누를 수 있게 만든다.
//
// **왜 따로 두는가** — Phaser의 hit area 좌표계는 origin과 무관하다.
// setOrigin(0.5, 0.5)로 가운데 정렬한 글자여도, 판정에 들어오는 좌표는
// 글자 상자의 **좌상단이 (0,0)인 공간**이다 (Phaser가 displayOrigin을 더해서 넘긴다).
//
// 이걸 origin 기준이라고 착각하면 Rectangle(-90, -12, 180, 24) 같은 걸 쓰게 되는데,
// 그러면 판정 범위가 x ∈ [-90, 90]이라 **글자 왼쪽 90px만 눌린다.**
// 타이틀의 `이어하기   DAY 1 · 누적 0`은 폭이 172px이었다 — 오른쪽 절반이 죽어 있었다.
// 폰에서 제일 처음 누르는 것이 그 줄이다.
//
// 그래서 좌표를 직접 쓰지 않고 **글자의 실측 크기에서 만든다.**
// 글이 바뀌면 상자도 바뀌므로, 텍스트를 갈아끼운 뒤에 다시 부른다.

/**
 * 글자 상자에 여백을 둘러 판정 영역을 (다시) 맞춘다.
 *
 * @param {Phaser.GameObjects.Text} t
 * @param {object}  [opt]
 * @param {number}  [opt.padX]   좌우 여백 (글자 상자 기준)
 * @param {number}  [opt.height] 판정 높이. **줄 간격을 넘기면 안 된다** —
 *                               넘기면 위아래 줄의 영역이 겹쳐서 엉뚱한 줄이 눌린다
 * @param {number}  [opt.left]   글자 좌상단 기준 왼쪽 끝. 주면 padX 대신 쓴다
 * @param {number}  [opt.width]  판정 폭. 주면 글자 폭 대신 쓴다 (줄 전체를 띠로 잡을 때)
 */
export function fitHitArea(t, opt = {}) {
  const padX = opt.padX ?? 12;
  const left = opt.left ?? -padX;
  const width = opt.width ?? t.width + padX * 2;
  // 글자 높이보다 작게 잡히면 손가락이 계속 빗나간다. 최소한 글자만큼은 준다
  const height = Math.max(opt.height ?? t.height + 12, t.height);
  const top = -(height - t.height) / 2;   // 글자를 세로 가운데에 두고 위아래로 벌린다

  if (!t.input) {
    t.setInteractive(
      new Phaser.Geom.Rectangle(left, top, width, height),
      Phaser.Geom.Rectangle.Contains
    );
  } else {
    t.input.hitArea.setTo(left, top, width, height);
  }
  return t;
}
