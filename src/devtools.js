// DEV 패널 버튼들. 개발용이라 제출 빌드에서는 index.html의 #dev 블록만 지우면 사라진다.
//
// 목적: 이벤트를 보려고 하루(실제 8분) + 정산(79초)을 기다리지 않아도 되게.

import * as save from './game/save.js';
import * as demo from './game/demo.js';

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
      // **화자 이름은 명단에서 찾을 수 있어야 한다.** 여기 아무 이름이나 쓰면
      // `npcIdOf`가 못 찾아서 흘린 말이 조용히 버려진다 (game/residents.js ROSTER).
      // 실제 판에서는 캐스팅이 '친구'에 설문에서 나온 이름을 씌운다
      lines: [
        { speaker: '친구', text: '야 살아있냐' },
        { speaker: '친구', text: '나 오늘 회사 앞에서 넘어짐ㅋㅋ' },
        { speaker: '친구', text: '요새 야근이라 저녁을 삼각김밥으로 때운다' },
      ],
      choices: [
        { id: 'c1', text: '살아있다', reads_as: '관계 수용' },
        { id: 'c2', text: '...', reads_as: '회피' },
        { id: 'c3', text: '안 힘들어?', reads_as: '상대 사정에 반응' },
      ],
      free_input: false,
      // 아무것도 요구하지 않았다. 이걸 듣고 편의점에서 사 오면 다음에 만났을 때 건넬 수 있다.
      // 키가 없어도 이 흐름 하나는 DEV 패널로 끝까지 볼 수 있게 목에 넣어둔다
      want: { item: 'onigiri', hint: '야근하느라 저녁을 삼각김밥으로 때운다' },
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

  // ── 시연 영상 (①→⑤ 순서대로 누른다) ──────────────────────
  //
  // 회피·바람을 못 박고 거기서 역산한 대본을 쓴다 (game/demo.js).
  // **API 키가 없어도 ①~④는 끝까지 돈다** — 답장을 표에서 꺼내기 때문.
  const demoButtons = [
    btn('⓪ 설문부터', '저장을 지우고 시작 설문 → 방 사진 → DAY 1 로 간다 (영상의 맨 앞)', () => {
      // 정식 흐름 그대로다 — 타이틀의 [처음부터]와 같은 길(TitleScene.start).
      // **저장을 먼저 지운다.** 안 지우면 설문을 다 answering하고도 이어하기가 살아 있어
      // 방에 들어간 순간 지난 판의 날짜와 점수가 그대로 뜬다
      save.clear();
      // **타이틀을 먼저 세운다.** 그냥 start('intro')만 하면 타이틀이 살아 있는 채로
      // 설문이 그 위에 뜨고, Space가 양쪽에 다 먹어서 첫 문항을 고르는 순간
      // 타이틀의 [이어하기]가 같이 눌려 방으로 튕긴다
      scene.scene.stop('title');
      scene.scene.start('intro');
      say('설문 9문항 → 방 사진(건너뛰기 가능) → DAY 1. 끝나면 [① 시연 시작]');
    }),

    btn('① 시연 시작', '가설(회피·바람)을 심고 골 맵을 붙인 뒤 친구 전화를 띄운다', () => {
      scene.startDemo();
      scene.playEvent({ id: demo.PHONE.event.id, event: demo.PHONE.event, script: demo.PHONE.script });
      say('친구 대화 — 선택지를 고르면 답장이 이어진다 (대본)');
    }),

    btn('② 정산창', '가설 테이블이 보이는 정산창을 지금 띄운다', () => {
      scene.demoSettle();
      say('회피·바람 두 줄이 ★확인됨으로 뜬다 — 여기서 2초 멈출 것');
    }),

    btn('③ 골 맵으로', '골목으로 옮겨 문이 열리는 이펙트를 재생한다', () => {
      scene.saveMapState();
      scene.leavePlace();
      scene.mapId = 'street';
      scene.buildMap();
      scene.syncGoalAura(true);
      scene.refresh();
      say('골목 아래쪽 빛나는 문으로 걸어 들어가세요 → 옥상, 거울 인물');
    }),

    btn('④ 붕괴', '거울 대화를 건너뛰고 바로 다음 날 붕괴로', () => {
      scene.collapseNext = true;
      scene.demoNextDay();
      say('화면이 눌린다. 이제 무엇을 해도 +0');
    }),

    btn('⑤ 현실 인증', `붕괴 다음 날로 넘겨 Act 4 창을 연다 — "${demo.REALITY_CLAIM}"`, () => {
      // **붕괴 당일에는 안 뜬다** — 0점짜리 하루를 통째로 살아본 다음이라야
      // "그럼 딴 걸 해라"가 거래로 안 보인다 (DESIGN.md §3 Act 4). 그 하루를 여기서 넘긴다
      if (scene.collapsed && scene.clock.day <= (scene.collapsedOn ?? -1)) scene.demoNextDay();
      else scene.reality.show(scene.realityClaim ?? demo.REALITY_CLAIM);
      say('사진을 올리면 +100 (Claude 비전 호출)');
    }),

    btn('⑤′ 인증 통과 처리', '키가 없을 때. 사진 없이 +100과 엔딩만 재생한다', () => {
      scene.reality.close?.();
      scene.passReality(100, { saw: '(시연) 실제로 한 장 찍었다' });
      say('+100 → 엔딩 화면');
    }),
  ];

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
      if (!scene.registerGoal(demo.GOAL)) return say('이미 열려 있다 — 골목 아래쪽 문');
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

  const sep = document.createElement('span');
  sep.className = 'note';
  sep.textContent = '│';

  slot.replaceChildren(...demoButtons, sep, ...buttons, status);
}

const fmtAt = (m) => {
  const t = Math.min(23 * 60 + 59, Math.floor(m));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
