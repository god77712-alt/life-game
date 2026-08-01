// 비전 호출(파이프라인 3단계)을 대신하는 목 데이터.
// API 키 없이 2·4단계를 끝까지 돌리기 위한 것 — 키가 생기면 이 배열 대신 프록시 응답을 넣는다.

export const MOCK_ROOMS = [
  {
    label: '표준 (room-vision.md 예시)',
    vision: {
      room_shape: 'rect',
      objects: [
        { type: 'bed', position: 'top-left', size: 'large', cleanable: false },
        { type: 'desk', position: 'mid-right', size: 'medium', cleanable: false },
        { type: 'monitor', position: 'mid-right', size: 'medium', cleanable: false },
        { type: 'chair', position: 'center', size: 'medium', cleanable: false },
        { type: 'clothes_pile', position: 'bottom-center', size: 'small', cleanable: true },
        { type: 'trash_pile', position: 'mid-left', size: 'small', cleanable: true },
        { type: 'cup', position: 'mid-right', size: 'small', cleanable: true },
        { type: 'window', position: 'top-wall', size: 'medium', cleanable: false },
        { type: 'door', position: 'bottom-wall', size: 'medium', cleanable: false },
      ],
      messiness: 0.7,
    },
  },
  {
    label: '포화 (큰 가구 6개)',
    vision: {
      room_shape: 'rect',
      objects: [
        { type: 'bed', position: 'top-left', size: 'large' },
        { type: 'wardrobe', position: 'top-center', size: 'large' },
        { type: 'desk', position: 'top-right', size: 'large' },
        { type: 'table', position: 'center', size: 'large' },
        { type: 'shelf', position: 'mid-left', size: 'large' },
        { type: 'drawer', position: 'mid-right', size: 'large' },
        { type: 'clothes_pile', position: 'bottom-left', size: 'small' },
        { type: 'trash_pile', position: 'bottom-center', size: 'small' },
        { type: 'box', position: 'bottom-right', size: 'small' },
        { type: 'door', position: 'bottom-wall', size: 'medium' },
      ],
      messiness: 0.9,
    },
  },
  {
    label: '난장판 (cleanable 6개)',
    vision: {
      room_shape: 'rect',
      objects: [
        { type: 'bed', position: 'top-right', size: 'large' },
        { type: 'pc', position: 'mid-left', size: 'medium' },
        { type: 'monitor', position: 'mid-left', size: 'medium' },
        { type: 'clothes_pile', position: 'center', size: 'small' },
        { type: 'clothes_pile', position: 'bottom-left', size: 'small' },
        { type: 'trash_pile', position: 'bottom-center', size: 'small' },
        { type: 'bottle', position: 'mid-right', size: 'small' },
        { type: 'cup', position: 'top-center', size: 'small' },
        { type: 'box', position: 'bottom-right', size: 'small' },
        { type: 'curtain', position: 'left-wall', size: 'medium' },
        { type: 'window', position: 'left-wall', size: 'medium' },
        { type: 'door', position: 'bottom-wall', size: 'medium' },
      ],
      messiness: 1.0,
    },
  },
  {
    label: '인식 실패 → 폴백',
    vision: { room_shape: 'rect', objects: [{ type: 'unknown_thing' }], messiness: 0 },
  },
];
