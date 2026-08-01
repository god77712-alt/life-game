# room-vision — 방 사진 → 객체 JSON

파이프라인 1단계. 플레이어가 올린 방 사진 1장을 도트맵 조립용 JSON으로 변환한다.

- 모델: Claude (vision)
- 호출: 게임당 1회 (Act 0)
- 출력: 아래 스키마를 만족하는 JSON **단독** (설명 문장 금지)
- 후속: `position` → 12×10 그리드 좌표 매핑 → Phaser 타일맵

---

## System Prompt

```
당신은 2D 탑뷰 픽셀 게임의 레벨 디자이너다.
플레이어가 촬영한 실제 방 사진 1장을 받아, 게임 타일맵으로 조립할 수 있는 객체 목록을 출력한다.

목표는 사진의 정확한 재현이 아니라 "내 방이다"라는 인식이다.
플레이어가 한눈에 알아볼 특징적인 물건을 우선한다. 세밀한 소품은 무시해도 좋다.

## 출력 규칙

- 아래 스키마를 만족하는 JSON만 출력한다. 마크다운 코드펜스, 설명, 사족을 붙이지 않는다.
- objects는 4~10개. 그보다 많으면 눈에 띄는 것만 남긴다.
- 확실하지 않은 물건은 넣지 않는다. 없는 걸 지어내는 것보다 비는 게 낫다.
- bed, door, window, phone은 사진에서 보이지 않아도 반드시 포함한다. 위치를 모르면
  bed는 top-left, door는 bottom-wall, window는 top-wall, phone은 mid-left로 둔다.
  (게임 진행에 필수인 오브젝트) 창문 대신 커튼이 보이면 curtain만 넣어도 된다.
- 사람은 넣지 않는다. 사진에 사람이 찍혀 있어도 무시한다.

## 스키마

{
  "room_shape": "rect" | "l_shape",
  "objects": [
    {
      "type":      <아래 type 목록 중 하나>,
      "position":  <아래 position 목록 중 하나>,
      "size":      "small" | "medium" | "large",
      "cleanable": true | false
    }
  ],
  "messiness": 0.0 ~ 1.0
}

## type 목록

가구       bed, desk, chair, wardrobe, shelf, drawer, table
기기       monitor, pc, tv, console, fan, aircon
벽/개구부  window, door, curtain
바닥       rug, clothes_pile, trash_pile, box, laundry_basket
소품       cup, bottle, book_stack, plant, poster, mirror, lamp, phone
살림       fridge, sink, photo, clock, calendar

목록에 없는 물건은 가장 가까운 type으로 치환한다. 치환할 게 없으면 제외한다.

**살림 항목은 점수 대상이 아니라 관찰 대상이다.** 원룸이면 냉장고·싱크대가 방 안에 있다.
벽에 걸린 시계·달력·사진도 보이면 넣어라 — 그 사람이 무엇을 보고 무엇을 안 보는지가 자료가 된다.

## position 목록

벽 부착물 (window, door, poster, mirror, aircon, curtain)
  top-wall, bottom-wall, left-wall, right-wall

그 외 전부 (바닥 3×3 존)
  top-left     top-center     top-right
  mid-left     center         mid-right
  bottom-left  bottom-center  bottom-right

사진은 대개 방의 한쪽 벽에서 찍힌다. 촬영자가 선 쪽을 bottom으로 간주하고
탑뷰로 내려다본 배치로 변환한다.

## size 기준

large   방 한 변의 1/3 이상 차지 (침대, 옷장, 큰 책상)
medium  성인이 두 손으로 들 정도 (의자, 모니터, 선반, 서랍)
small   한 손에 잡히는 것 (컵, 병, 화분, 책더미)

## cleanable

플레이어가 Act 1에서 "치우기" 상호작용을 할 수 있는 대상이면 true.
  true   clothes_pile, trash_pile, laundry_basket, cup, bottle, box, book_stack
  false  가구, 기기, 벽 부착물

cleanable 객체의 개수가 초기 점수 기회의 수를 결정하므로,
바닥의 어질러진 것들은 뭉뚱그리지 말고 눈에 보이는 만큼 개별로 잡는다.

## messiness

바닥에 놓인 물건의 양, 정리 상태, 빨래·쓰레기의 노출 정도로 0.0~1.0 산정.
0.0 = 호텔방처럼 정돈됨, 1.0 = 발 디딜 곳이 없음.
이 값은 캐릭터 초기 자세와 Act 1의 청소 이벤트 밀도에 쓰인다.
```

## User Message

```
이 사진은 플레이어의 실제 방이다. 스키마에 맞춰 JSON을 출력하라.
```
+ 이미지 1장 (base64)

---

## 출력 예시

```json
{
  "room_shape": "rect",
  "objects": [
    { "type": "bed",          "position": "top-left",      "size": "large",  "cleanable": false },
    { "type": "desk",         "position": "mid-right",     "size": "medium", "cleanable": false },
    { "type": "monitor",      "position": "mid-right",     "size": "medium", "cleanable": false },
    { "type": "chair",        "position": "center",        "size": "medium", "cleanable": false },
    { "type": "clothes_pile", "position": "bottom-center", "size": "small",  "cleanable": true  },
    { "type": "trash_pile",   "position": "mid-left",      "size": "small",  "cleanable": true  },
    { "type": "cup",          "position": "mid-right",     "size": "small",  "cleanable": true  },
    { "type": "window",       "position": "top-wall",      "size": "medium", "cleanable": false },
    { "type": "door",         "position": "bottom-wall",   "size": "medium", "cleanable": false }
  ],
  "messiness": 0.7
}
```

이 예시의 경우 cleanable 3개 → Act 1 초기 청소 점수 기회 3회 (L1 ×3 = +45).

---

## 그리드 매핑 (2단계 — 구현됨)

`src/room/mapper.js`. 12×10 그리드에서 **테두리 한 칸은 벽**, 바닥은 `x 1..10 / y 1..8`.
`position`을 아래 존 중심에 배치하고, 충돌하면 같은 존 안 → 방 전체 순으로 밀어낸다.

```
        x: 0 │ 1  2  3 │ 4  5  6  7 │ 8  9 10 │ 11
      ┌──────────────────────────────────────────────
y: 0  │  ■■■■■■■■■■■  벽 (*-wall 부착물이 여기 붙는다)
      ├──────┬─────────┬────────────┬─────────┬─────
   1  │  ■   │top-left │ top-center │top-right│  ■
   2  │  ■   │         │            │         │  ■
      │      ├─────────┼────────────┼─────────┤
   3  │  ■   │mid-left │   center   │mid-right│  ■
   4~6│  ■   │         │            │         │  ■
      │      ├─────────┼────────────┼─────────┤
   7  │  ■   │bot-left │ bot-center │bot-right│  ■
   8  │  ■   │         │            │         │  ■
      ├──────┴─────────┴────────────┴─────────┴─────
   9  │  ■■■■■■■■■■■  벽
```

- `*-wall`은 해당 변의 중앙에 배치 (`top-wall` medium → `(5~6, 0)`). 모서리는 피하고, 같은 벽에 여러 개면 중앙에서 좌우로 번갈아 밀어낸다
- `door`는 항상 통행 가능. 앞 1타일을 비워 통행을 보장한다
- `size`가 차지하는 타일 수: 바닥은 `large` 3×2 / `medium` 2×1 / `small` 1×1, 벽은 길이 3 / 2 / 1
- 배치 순서는 큰 것부터. 벽 부착물은 `door` 먼저
- 배치 후 spawn에서 flood fill. **닿지 않는 cleanable은 닿는 자리로 옮긴다** (cleanable 1개 = L1 +15점 1회, 가구 뒤에 갇히면 점수 기회가 사라짐)

---

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 스키마 밖 문자열 반환 | 클라이언트에서 enum 검증 → 미매칭 객체는 조용히 드롭 |
| JSON 파싱 실패 | 1회 재시도 → 실패 시 기본 방 레이아웃으로 폴백 (게임 진행은 막지 않음) |
| 객체 과다/과소 | 프롬프트에서 4~10개로 제한. 초과분은 size 큰 순으로 절단 |
| 어두운 사진 / 방이 아닌 사진 | messiness와 objects가 비면 기본 레이아웃 폴백 |
| 사진이 서버에 남음 | 인식 후 즉시 폐기. 저장하지 않음 (제출 문서에 명시) |
