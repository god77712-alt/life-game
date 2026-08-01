// DEV 패널 버튼들. 개발용이라 제출 빌드에서는 index.html의 #dev 블록만 지우면 사라진다.
//
// 목적: 이벤트를 보려고 하루(실제 8분) + 정산(79초)을 기다리지 않아도 되게.

import * as save from './game/save.js';

const MOCK_SCRIPTS = [
  {
    event: { id: 'mock_1', at: '10:30', kind: 'dialogue', target: 'none', signal_wanted: ['language', 'reaction'] },
    script: {
      lines: [
        { speaker: '엄마', text: '밥 문 앞에 뒀다.' },
        { speaker: '엄마', text: '국은 데워 먹어.' },
        { speaker: '엄마', text: '무 넣은 거 남아서 그냥 넣었어.' },
      ],
      choices: [
        { id: 'c1', text: '고마워', reads_as: '관계 수용 — 짧지만 응답함' },
        { id: 'c2', text: '...', reads_as: '회피 — 응답 자체를 흘림' },
        { id: 'c3', text: '무 넣었어?', reads_as: '재료에 반응함' },
      ],
      free_input: false,
    },
  },
  {
    event: { id: 'mock_2', at: '19:00', kind: 'triple', target: 'none', signal_wanted: ['behavior'] },
    script: {
      lines: [
        { speaker: '지훈', text: '야 살아있냐' },
        { speaker: '지훈', text: '나 오늘 회사 앞에서 넘어짐ㅋㅋ' },
        { speaker: '지훈', text: '편의점 새 도시락 나왔던데 먹어봤냐' },
      ],
      choices: [
        { id: 'c1', text: '살아있다', reads_as: '관계 수용' },
        { id: 'c2', text: '...', reads_as: '회피' },
        { id: 'c3', text: '뭐 나왔는데', reads_as: '바깥 정보에 반응' },
      ],
      free_input: false,
    },
  },
];

// 엔딩을 보려면 게임 안에서 9~10일(실제 80분)을 살아야 한다.
// 시연 영상을 찍을 때도 필요하므로 마지막 세 장면으로 바로 가는 길을 둔다.
const MOCK_GOAL = {
  label: '계단 밑, 그릇이 이미 놓여 있는 자리',
  theme: 'street',
  arrive: '밥그릇 두 개 중 하나는 이미 채워져 있고, 물그릇은 바로 놓여 있다.',
  reason: '(치트) 대면 전달이 문턱이라 주고받는 자리를 없앤 배치',
  objects: [
    { type: 'shelf', position: 'mid-right', size: 'large', cleanable: false },
    { type: 'box', position: 'mid-left', size: 'medium', cleanable: false },
    { type: 'chair', position: 'bottom-left', size: 'medium', cleanable: false },
    { type: 'lamp', position: 'top-right', size: 'small', cleanable: false },
    { type: 'plant', position: 'bottom-right', size: 'large', cleanable: false },
    { type: 'rug', position: 'bottom-center', size: 'large', cleanable: false },
    { type: 'bottle', position: 'mid-left', size: 'small', cleanable: false },
    { type: 'cup', position: 'center', size: 'small', cleanable: false },
    { type: 'calendar', position: 'left-wall', size: 'small', cleanable: false },
  ],
  mirror: {
    name: '따지 않은 캔을 든 사람',
    look: 'person',
    detail: '무릎 위 비닐봉지에 캔이 두 개. 둘 다 아직 안 뜯겨 있다.',
    opening: '물그릇은 누가 바로 놓고 갔네.',
    speech: [
      '한 문장이 짧다. 열 자에서 스무 자 사이.',
      '자기 얘기는 하려다가 뒤를 흐린다.',
      '묻는 쪽이다. 답을 받으면 "아" 하고 넘어간다.',
    ].join('\n'),
    stuck: '고르는 일과 손대는 일. 캔 두 개 중 어느 걸 딸지 못 정해서 결국 둘 다 안 딴다.',
    wants: '고양이한테 자기 손으로 밥을 부어주는 것.',
  },
};

const btn = (label, title, onClick) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', (e) => { e.preventDefault(); b.blur(); onClick(b); });
  return b;
};

/** @param {Phaser.Scene} scene RoomScene */
export function mountDevTools(scene) {
  const slot = document.getElementById('dev');
  if (!slot) return;

  const status = document.createElement('span');
  status.className = 'note';
  const say = (t) => { status.textContent = t; };

  const buttons = [
    btn('대화 즉시', 'API 없이 목 대본으로 대화창을 지금 띄운다', () => {
      if (scene.dialogue.open) return say('이미 대화 중');
      const pick = MOCK_SCRIPTS[Math.floor(Math.random() * MOCK_SCRIPTS.length)];
      scene.playEvent({ id: pick.event.id, event: pick.event, script: pick.script });
      say('목 대화 재생 — 선택까지 해보세요');
    }),

    btn('목 이벤트 예약', '목 대본 2건을 지금 시각 직후로 예약. 시계만 돌면 뜬다', () => {
      scene.pendingScripts = MOCK_SCRIPTS.map((m, i) => ({
        event: { ...m.event, at: fmtAt(scene.clock.minutes + 5 + i * 30) },
        script: m.script,
      }));
      scene.applySchedule();
      say(`예약 ${scene.schedule.items.length}건 — [다음 이벤트로] 를 누르세요`);
      scene.refresh();
    }),

    btn('다음 이벤트로', '시계를 다음 예약 시각으로 점프', () => {
      const next = scene.schedule?.pending?.[0];
      if (!next) return say('예약된 이벤트가 없다');
      scene.clock.minutes = next.at;
      say(`${next.event.at} 로 점프`);
    }),

    btn('정산 실행', '실제 AI 정산을 지금 돌린다 (약 80초, 약 $0.16)', async (b) => {
      b.disabled = true;
      say('정산 중… analyst → director → writer (약 80초)');
      const t0 = Date.now();
      scene.fireSettle();
      const out = await scene.settlePromise;
      b.disabled = false;
      if (!out) return say(`실패: ${scene.settleError}`);
      say(`완료 ${Math.round((Date.now() - t0) / 1000)}초 · 편성 ${out.plan?.events?.length ?? 0}건 · `
        + `in=${out.total?.input} out=${out.total?.output} · [다음 날] 후 [다음 이벤트로]`);
    }),

    btn('다음 날', '정산창 없이 바로 다음 날로', () => {
      scene.sleepMinutes = scene.clock.minutes >= 20 * 60 ? scene.clock.minutes : null;
      scene.nextDay();
      say(`DAY ${scene.clock.day} ${scene.clock.label} 기상`);
    }),

    btn('골 맵 열기', '가설 확정을 건너뛰고 골목 아래에 골 맵을 붙인다 (Act 3)', () => {
      if (!scene.registerGoal(MOCK_GOAL)) return say('이미 열려 있다 — 골목 아래쪽 문');
      say('골목 아래에 문이 생겼다. 방→거실→골목→아래로 가면 거울이 있다');
    }),

    btn('붕괴 예약', '거울을 만난 것으로 치고, 다음 기상부터 전 행동 +0 (Act 3 끝)', () => {
      scene.collapseNext = true;
      say('[다음 날] 을 누르면 붕괴. 그 다음 날 아침에 현실 인증이 뜬다');
    }),

    btn('현실 인증 띄우기', 'Act 4 창을 지금 연다 (실제 사진 확인 — 약 $0.02)', () => {
      scene.reality.show('이불 개기');
      say('실제 이불 사진을 올려보세요. 통과하면 +100');
    }),

    btn('새 게임', '저장을 지우고 DAY 1부터 다시 (되돌릴 수 없다)', () => {
      save.clear();
      scene.loadRoom(0);
      say('저장을 지웠다. DAY 1 14:00');
    }),

    btn('이어하기 코드', '지금 저장을 문자열로 복사한다. 다른 기기에 붙여넣으면 이어진다', async () => {
      save.save(scene);
      const code = save.exportCode();
      if (!code) return say('저장이 없다');
      try {
        await navigator.clipboard.writeText(code);
        say(`복사됨 ${code.length}자 — 다른 기기에서 [코드로 불러오기]`);
      } catch {
        window.prompt('아래를 복사해서 다른 기기에 붙여넣으세요', code);
        say('창에서 직접 복사하세요');
      }
    }),

    btn('코드로 불러오기', '다른 기기에서 만든 이어하기 코드를 붙여넣는다', () => {
      const code = window.prompt('이어하기 코드를 붙여넣으세요');
      if (!code) return say('취소');
      const s2 = save.importCode(code);
      if (!s2) return say('코드 형식이 아니다 — 저장은 그대로 둔다');
      scene.restore(s2);
      say(`DAY ${s2.day} 로 이어감 (누적 ${s2.total})`);
    }),

    btn('시간 ×20', '시계 배속 전환', (b) => {
      scene.timeScale = scene.timeScale === 20 ? 1 : 20;
      b.textContent = scene.timeScale === 20 ? '시간 ×1' : '시간 ×20';
      say(`배속 ×${scene.timeScale}`);
    }),
  ];

  slot.replaceChildren(...buttons, status);
}

const fmtAt = (m) => {
  const t = Math.min(23 * 60 + 59, Math.floor(m));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
