// DEV 패널 버튼들. 개발용이라 제출 빌드에서는 index.html의 #dev 블록만 지우면 사라진다.
//
// 목적: 이벤트를 보려고 하루(실제 8분) + 정산(79초)을 기다리지 않아도 되게.

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
