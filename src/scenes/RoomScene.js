// 파이프라인 4단계: buildRoom() 출력 → 화면 + 상호작용 + 하루.
// 매퍼가 준 collision 그리드를 그대로 이동 판정에 쓴다. 물리 엔진 없음.

import { validateVision, GRID_W, GRID_H } from '../room/schema.js';
import { buildRoom } from '../room/mapper.js';
import { MOCK_ROOMS } from '../room/mock.js';
import { MAPS, ROOM_EXIT, returnWall, GOAL_ID, registerGoalMap, clearGoalMap, mapList, freeSpots } from '../game/maps.js';
import { actionFor, potentialScore, promptLine, nameOf } from '../game/actions.js';
import { Clock, fmt } from '../game/clock.js';
import { residentsAt, timeBand, mealAt } from '../game/residents.js';
import { initialAffinity, raise, affinityLines, affinityOf } from '../game/affinity.js';
import { ITEMS, POINT_PER_SCORE, buy, take, has, bagList, wantedFrom, itemLabel } from '../game/shop.js';
import * as errands from '../game/errands.js';
import * as effects from '../game/effects.js';
import { Schedule } from '../game/schedule.js';
import { initialVitals, tickVitals, afterSleep, vitalsLine } from '../game/vitals.js';
import { Observer } from '../game/observer.js';
import { Phone } from '../game/phone.js';
import { ambientLine, ambientOverrides } from '../game/ambient.js';
import { discloses } from '../game/listening.js';
import { settleLines, devLine } from '../game/table.js';
import * as save from '../game/save.js';
import { Overlay } from '../ui/overlay.js';
import { Dialogue } from '../ui/dialogue.js';
import { Reality } from '../ui/reality.js';
import { ChatInput } from '../ui/chatinput.js';
import { Ending } from '../ui/ending.js';
import { Touch } from '../ui/touch.js';
import { TILE, ROOM_TOP, buildBaseTextures, objectTexture, THEMES } from '../render/textures.js';

/** 부탁을 할 수 있는 사람들. 여기 없는 id로 온 부탁은 버려진다 (game/residents.js와 같은 키) */
const NPC_IDS = ['mom', 'clerk', 'friend', 'homeless', 'cat'];

/** 붙박이 이름 → 호감도 키. 찾아온 사람이 그 사람인지 알아보는 데 쓴다 */
const NPC_NAME_TO_ID = { 엄마: 'mom', 친구: 'friend', 노숙자: 'homeless', 길고양이: 'cat', '편의점 알바생': 'clerk' };

/** 채팅 이력을 몇 턴까지 기억하나. 짧으면 상대가 방금 한 말을 잊는다 */
const CHAT_MEMORY = 40;

const STEP_MS = 160;                          // 한 칸 이동 시간 (ART.md §3)
const DIRS = {
  up: { dx: 0, dy: -1, tex: 'player-back', flip: false },
  down: { dx: 0, dy: 1, tex: 'player-front', flip: false },
  left: { dx: -1, dy: 0, tex: 'player-side', flip: true },
  right: { dx: 1, dy: 0, tex: 'player-side', flip: false },
};

export class RoomScene extends Phaser.Scene {
  constructor() {
    super('room');
  }

  /** 타이틀·설문이 넘겨주는 것. 사진에서 온 방이거나, 이어하기거나, 둘 다 아니거나. */
  init(data = {}) {
    this.entry = data;
  }

  create() {
    buildBaseTextures(this);

    this.layer = this.add.container(0, 0);
    this.cue = this.add.graphics().setDepth(8000);      // 상호작용 대상 표시
    this.debugG = this.add.graphics().setDepth(9500).setVisible(false);

    // 어둠 오버레이 — 밝기는 분위기가 아니라 점수 피드백이다 (ART.md §4)
    this.dim = this.add.rectangle(0, 0, GRID_W * TILE, ROOM_TOP + GRID_H * TILE, 0x0b1020)
      .setOrigin(0, 0).setDepth(9000);

    // 대상 설명 라벨. 어둠 오버레이(9000)보다 위 — 캄캄한 방에서도 읽혀야 한다.
    // 임시로 시스템 폰트를 쓴다. 비트맵 한글 폰트가 들어오면 여기만 교체 (ART.md §5)
    this.labelBox = this.add.graphics().setDepth(9200).setVisible(false);
    this.label = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#e8dcc0', resolution: 1,
    }).setOrigin(0.5, 1).setDepth(9201).setVisible(false);

    this.overlay = new Overlay(this);
    this.dialogue = new Dialogue(this);

    // Act 4. 게임이 점수를 다 0으로 만든 다음에야 뜬다 — 여기서만 점수가 붙는다
    this.reality = new Reality((score, verdict) => this.passReality(score, verdict));
    // 마지막 화면. 설명하지 않는다 — 숫자를 나란히 두는 것으로 충분하다
    this.ending = new Ending(() => { save.clear(); this.scene.start('title'); });

    // 손가락도 같은 규칙을 따른다 — 칸을 누르면 걷고, 대상을 누르면 그 행동을 한다
    this.touch = new Touch(this);

    // 직접 말하기. **자기 얘기는 오직 여기서만 나온다** (listening.js)
    this.chat = new ChatInput(this);
    this.dialogue.onInputOpen = () => this.chat.show(
      (text) => this.sayFreely(text),
      () => this.dialogue.showChoices(),          // 취소하면 선택지로 돌아온다
    );
    // 엔딩에서 타이틀로 나가면 이 씬은 버려진다. input 상자와 resize 리스너를 걷는다
    this.events.once('shutdown', () => this.chat.destroy());

    // 디렉터가 쓰는 누적 상태. 하루마다 갱신되고 다음 정산의 입력이 된다.
    this.table = { hypotheses: [], avoidance: { pattern: '', evidence: [] } };
    this.history = [];
    this.schedule = null;
    this.settlePromise = null;

    // 설문에서 넘어온 세계. 캐스팅은 아직 도는 중일 수 있다 — 기다리지 않는다.
    this.survey = this.registry.get('survey') ?? null;
    this.world = null;
    this.cast = [];
    this.registry.get('casting')?.then((out) => {
      if (out?.error) { console.warn('[casting]', out.error); return; }
      this.world = out.world;
      this.cast = out.cast ?? [];
      this.gapNote = out.gap_note;
      this.refresh();
      this.fireOpening();          // 세계가 섰으니 DAY 1 무대를 깐다
    });

    // 들어온 경로에 따라 시작이 다르다
    if (this.entry?.resume && this.restore(save.load())) {
      /* 타이틀에서 [이어하기] */
    } else if (this.entry?.vision) {
      this.loadVision(this.entry.vision, '내 방');       // 방금 찍은 방
    } else if (!this.restore(save.load())) {
      this.loadRoom(0);                                  // 준비된 방
    }

    // 방향키·Space가 페이지를 스크롤시키지 않게 브라우저 기본 동작을 막는다
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,W,A,S,D');

    this.keys = this.input.keyboard.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
    });
    // 누른 순간을 큐에 담는다. isDown 폴링만 쓰면 프레임 사이에 끝난 짧은 탭이 씹힌다.
    this.queued = null;
    for (const [key, dir] of [
      ['LEFT', 'left'], ['A', 'left'], ['RIGHT', 'right'], ['D', 'right'],
      ['UP', 'up'], ['W', 'up'], ['DOWN', 'down'], ['S', 'down'],
    ]) {
      this.input.keyboard.on(`keydown-${key}`, () => {
        if (this.dialogue.open) {
          if (dir === 'up') this.dialogue.move(-1);
          else if (dir === 'down') this.dialogue.move(1);
          return;
        }
        this.queued = dir;
      });
    }

    // 키 하나. 대화 중이면 진행, 정산창이면 다음 날, 아니면 상호작용.
    this.input.keyboard.on('keydown-SPACE', (e) => {
      e.preventDefault?.();
      if (this.dialogue.open) this.dialogue.advance();
      else if (this.settling) this.nextDay();
      else this.interact();
    });

    this.input.keyboard.on('keydown-G', () => {
      this.debugG.setVisible(!this.debugG.visible);
      if (this.debugG.visible) this.drawDebug();
    });
    // 'R'(방 교체)은 뺐다 — 채팅 중에 눌리면 게임이 통째로 리셋됐다.
    // 목 방을 바꿀 일은 개발 초기에만 있었고, 지금은 DEV 패널로 충분하다.
  }

  // ── 방 · 하루 ────────────────────────────────────────────

  /** 새 게임. 방을 갈아끼우고 Day 1 14:00부터 다시 시작한다. */
  loadRoom(index) {
    this.roomIndex = index;
    this.custom = null;
    this.total = 0;
    this.resetEnding();
    this.clock = new Clock();
    this.vitals = initialVitals();
    this.affinity = initialAffinity();
    this.npcNames = new Map();
    this.points = 0;                // 쓸 수 있는 포인트. 누적 점수와 별개로 줄어든다
    this.bag = {};                  // 산 것들
    this.sleptLastNight = true;
    this.rebuild();
  }

  /** 실제 사진에서 온 방 (Act 0). 프록시가 준 비전 JSON을 그대로 받는다. */
  loadVision(vision, label = '내 방') {
    this.custom = { label, vision };
    this.total = 0;
    this.resetEnding();
    this.clock = new Clock();
    this.rebuild();
  }

  /**
   * 골 맵을 지도에 붙이고 화면에 반영한다. 정산 응답과 DEV 치트가 같은 길을 쓴다.
   * @returns {boolean} 붙였는가 (이미 있으면 false)
   */
  registerGoal(goal) {
    if (!registerGoalMap(goal)) return false;
    this.goal = goal;
    if (this.mapId === 'street') this.buildMap();   // 지금 골목에 서 있으면 문이 바로 생겨야 한다
    this.refresh();
    return true;
  }

  /** 현실에서 실제로 했다. **이 게임에서 점수가 붙는 마지막 행동** (DESIGN.md §2 R). */
  passReality(score, verdict) {
    this.realityDone = true;
    this.total += score;                       // scoreFor를 안 거친다 — 붕괴가 막지 못하는 유일한 점수
    this.todayScore += score;
    this.todayLog.push({ label: '현실 — 이불 개기 (사진 인증)', tier: 'R', score });
    this.lastAction = `현실 이불 개기  +${score}`;
    this.dialogueLog.push({ at: this.clock.label, from: '현실', saw: verdict?.saw ?? '', score });
    this.overlay.popScore(this.gx * TILE + TILE / 2, ROOM_TOP + (this.gy + 1) * TILE - 6, score);
    this.overlay.drawHud(this.clock, this.todayScore, this.total, this.aiError, this.points);
    this.refresh();
    this.persist();

    // 한 박자 두고 마지막 화면. 점수가 뜨는 걸 먼저 보게 한다
    const opened = (this.observer?.told ?? []).filter((t) => t.self);
    const last = opened[opened.length - 1] ?? null;
    this.time.delayedCall(1800, () => this.ending.show({
      days: this.clock.day,
      inGame: Math.max(0, this.total - score),
      real: score,
      saw: verdict?.saw ?? '',
      told: last?.text ?? '',
      toWhom: last?.to ?? '',
    }));
  }

  /** 새 게임. 골 맵은 게임마다 새로 지어지고 붕괴도 풀린다. */
  resetEnding() {
    clearGoalMap();
    this.reality?.close();
    this.realityDone = false;
    this.collapsedOn = null;
    this.collapsed = false;
    this.collapseNext = false;
    this.mirrorTurn = 0;
    this.mirrorLog = [];
    this.goal = null;
    this.plan = null;
    this.aiError = null;
    this.table = { hypotheses: [], avoidance: { pattern: '', evidence: [] } };
  }

  /**
   * 저장에서 이어한다. 화면에 있는 것(스프라이트·충돌)은 다시 만들면 되므로
   * **하루의 흐름을 결정하는 것**만 되돌린다.
   * @returns {boolean} 이어했는가
   */
  restore(s) {
    if (!s) return false;
    try {
      this.resetEnding();
      this.roomIndex = s.roomIndex ?? 0;
      this.custom = s.room ?? null;
      this.total = s.total ?? 0;
      this.survey = s.survey ?? this.survey;
      this.world = s.world ?? null;
      this.cast = s.cast ?? [];
      this.table = s.table ?? this.table;
      this.history = s.history ?? [];
      this.plan = s.plan ?? null;
      this.collapsed = !!s.collapsed;
      this.collapseNext = !!s.collapseNext;
      this.collapsedOn = s.collapsedOn ?? null;
      this.realityDone = !!s.realityDone;
      this.mirrorTurn = s.mirrorTurn ?? 0;
      this.mirrorLog = s.mirrorLog ?? [];
      this.sleptLastNight = s.sleptLastNight !== false;
      if (s.goal) this.registerGoal(s.goal);        // 골 맵이 열려 있었으면 문도 그대로

      // **그날 아침으로 되돌린다.** 방·관측·오늘 한 일은 rebuild가 초기화하므로,
      // 19시에 이어붙이면 치운 쓰레기가 되살아난 채 저녁이 된다. 하루 단위가 맞다.
      this.clock = new Clock();
      this.clock.day = s.day ?? 1;
      this.clock.start(s.wake ?? 0);
      this.vitals = initialVitals();
      // 호감도는 그날 아침으로 되돌리지 않는다 — 관계는 하루로 초기화되는 게 아니다
      this.affinity = initialAffinity(s.affinity);
      this.points = s.points ?? 0;
      this.pending = s.pending ?? [];
      this.placed = s.placed ?? [];
      this.bag = s.bag ?? {};
      this.npcNames = new Map(Object.entries(s.npcNames ?? {}));
      this.rebuild();
      // 어제 쌓인 원문은 관측에 되돌려 넣는다 — 거울의 재료다
      for (const t of s.told ?? []) this.observer.told.push(t);
      this.openingFired = true;                     // DAY 1 편성을 다시 쏘지 않는다
      this.refresh();
      return true;
    } catch (e) {
      console.warn('[restore]', e.message);
      return false;
    }
  }

  /** 하루가 바뀔 때·정산이 끝날 때 저장한다. 매 프레임 쓰면 느려진다. */
  persist() {
    if (this.clock) save.save(this);
  }

  get source() {
    return this.custom ?? MOCK_ROOMS[this.roomIndex];
  }

  /**
   * 다음 날. 취침 시각이 내일 기상 시각을 정한다 (DESIGN.md §1).
   * **여기는 침대에서 잤을 때만 온다** — 자정은 더 이상 하루를 끝내지 않는다.
   */
  nextDay() {
    this.overlay.hideSettlement();
    this.sleptLastNight = true;
    this.vitals = afterSleep(this.vitals);
    this.clock.nextDay(this.sleepMinutes ?? this.clock.minutes);
    this.rebuild();
  }

  /**
   * 방을 세우고 하루를 초기화한다.
   * 매일 방은 원상복구된다 — 쓰레기가 다시 생기고 커튼이 다시 쳐진다.
   * DESIGN.md §2 "날짜가 바뀌면 리셋, 반복 체감 없음". 아무것도 변하지 않는 반복이 이 게임의 배경이다.
   */
  rebuild() {
    this.mapId = 'room';            // 하루는 항상 자기 방에서 시작한다
    this.visited = new Set();       // 오늘 도착한 공간 — L2 점수는 공간당 하루 1회
    this.mapState = new Map();      // 맵별 오브젝트 상태. 나갔다 와도 치운 건 치워진 채로
    this.houseLit = false;          // 집 안 창문/커튼을 하나라도 열었는가 (하루 단위)
    this.done = new Set();          // 오늘 이미 한 행동. 키는 `맵:오브젝트id`
    this.observer = new Observer(); // 반응한 것 · 지나친 것 · 안 본 것
    this.phone = new Phone();       // 연락은 여기 쌓인다. 여는 것은 플레이어의 선택
    this.metProps = new Set();      // 오늘 이미 다가간 무대
    this.propNames = new Map();     // 관측 키 → 이름
    this.errands = [];             // 오늘의 부탁. 디렉터가 만든다 (game/errands.js)
    this.visitors = [];            // 오늘 찾아온 사람들. `{map}`에 매여 있다
    this.gaveTo = new Set();       // 오늘 뭔가 건넨 상대. 가방과 포인트는 날짜를 넘어 남는다
    this.buildMap();
    this.enterPlace();
    this.todayScore = 0;
    this.todayLog = [];
    this.dialogueLog = [];
    this.lastAction = null;
    this.settling = false;
    this.sleepMinutes = null;
    this.schedule = null;

    // 안 잤으면 이불이 그대로 개어져 있다 → '이불 개기 +10' 기회가 없다.
    // 처벌이 아니라 기회 상실 (감점 없음·가점만 — DESIGN.md §2)
    if (this.sleptLastNight === false) {
      const bed = this.built.objects.find((o) => o.type === 'bed');
      if (bed) this.paint(bed, 'made');
    }
    // 거울을 만난 다음 기상부터 전 행동 +0. 여기서 딱 한 번 넘어간다
    if (this.collapseNext) {
      this.collapsed = true;
      this.collapseNext = false;
      this.collapsedOn = this.clock.day;
    }
    // 붕괴 하루가 지나야 현실 전환이다 (DESIGN.md §3 Act 4).
    // 붕괴 당일에 바로 요구하면 "0점이니 딴 걸 하라"는 거래처럼 보인다 —
    // 하루를 통째로 0점으로 살아본 다음이라야 그게 거래가 아니게 된다.
    if (this.collapsed && !this.realityDone && this.clock.day > (this.collapsedOn ?? Infinity)) {
      this.time.delayedCall(1200, () => this.reality.show('이불 개기'));
    }
    this.applySchedule();           // 정산이 이미 끝나 있으면 바로 예약

    this.overlay.drawHud(this.clock, this.todayScore, this.total, this.aiError, this.points);
    this.refresh();
    this.persist();
  }

  /**
   * 현재 맵을 세운다. 하루 상태는 건드리지 않는다 — 이동할 때도 쓰기 때문.
   * @param {{x: number, y: number}} [spawnAt] 도착 지점 (문 앞)
   */
  buildMap(spawnAt) {
    const isRoom = this.mapId === 'room';
    const src = isRoom ? this.source : MAPS[this.mapId];

    // 사진 맵만 검증을 거친다. 손으로 쓴 맵은 검증하면 문이 하나로 합쳐진다.
    const v = isRoom ? validateVision(src.vision) : { room: src.vision, dropped: [], fellBack: false };
    // 누가 놓아준 것이 있으면 이 공간에 함께 세운다 (game/effects.js — "방으로 가져다줄게")
    const gifts = (this.placed ?? []).filter((p) => p.map === this.mapId);
    const room = gifts.length
      ? { ...v.room, objects: [...v.room.objects, ...gifts.map((g) => ({
        type: g.type, position: 'center', size: 'medium', cleanable: false, placed: true, note: g.note,
      }))] }
      : v.room;
    this.built = buildRoom(room);
    this.meta = { label: src.label, dropped: v.dropped, fellBack: v.fellBack };
    this.baseMessiness = this.built.messiness;

    this.overlay.clearPops();
    this.layer.removeAll(true);
    this.drawFloorAndWalls();
    this.drawObjects();
    this.restoreMapState();          // 치운 쓰레기·갠 이불·열린 창문을 되돌린다
    this.drawNpcs();
    this.spawnPlayer(spawnAt);

    this.applyLight();
    if (this.debugG.visible) this.drawDebug();
  }

  // ── 맵별 상태 보존 ──────────────────────────────────────
  // 맵을 떠나면 다시 지어지므로, 저장해두지 않으면 치운 쓰레기가 되살아난다.

  saveMapState() {
    const removed = [];
    const variants = {};
    for (const o of this.built.objects) {
      if (o.removed) removed.push(o.id);
      else if (o.variant) variants[o.id] = o.variant;
    }
    this.mapState.set(this.mapId, { removed, variants });
  }

  restoreMapState() {
    const st = this.mapState.get(this.mapId);
    if (!st) return;
    for (const o of this.built.objects) {
      if (st.removed.includes(o.id)) {
        o.removed = true;
        o.sprite?.destroy();
        o.sprite = null;
        this.clearCollision(o);
      } else if (st.variants[o.id]) {
        this.paint(o, st.variants[o.id]);
      }
    }
  }

  /** 하루 1회 판정 키. 맵을 붙이지 않으면 방의 쓰레기를 치웠다고 현관 쓰레기가 잠긴다. */
  doneKey(action) {
    return `${this.mapId}:${action.key}`;
  }

  // ── 오늘의 무대 ─────────────────────────────────────────
  // 고정 NPC는 없다. 디렉터가 매일 다른 것을 다른 자리에 놓는다 (DESIGN.md §5).

  /** 오늘 이 공간에 짜인 무대 */
  sceneHere() {
    return (this.plan?.scenes ?? []).find((s) => s.place === this.mapId) ?? null;
  }

  drawNpcs() {
    this.props = [];
    // 찾아온 사람은 **슬롯을 안 쓴다.** 그 자리에 온 것이므로 좌표를 이미 갖고 있고,
    // 사진에서 온 내 방(슬롯이 없는 맵)에도 설 수 있어야 한다
    this.drawVisitors();
    const slots = MAPS[this.mapId]?.slots ?? [];
    if (!slots.length) return;

    // 골 맵의 거울은 디렉터의 무대가 아니라 그 공간 자체에 속한다. 매일 바뀌지 않는다.
    const mirror = this.mapId === GOAL_ID ? MAPS[GOAL_ID].mirror : null;

    let list;
    if (mirror) {
      list = [{ ...mirror, slot: slots[0].id, isMirror: true }];
    } else {
      // **붙박이가 먼저 자리를 잡고, 디렉터의 오늘 무대가 그 위에 얹힌다.**
      // 순서가 이래야 AI가 죽어도 세상이 비지 않는다 (game/residents.js).
      // 같은 자리를 노리면 디렉터 쪽이 진다 — 오늘만의 장면이 더 귀하다
      const fixed = residentsAt(this.mapId, this.clock.minutes, this.clock.day);
      const today = this.sceneHere()?.props ?? [];
      const taken = new Set(today.map((p) => p.slot));
      list = [...today, ...fixed.filter((r) => !taken.has(r.slot))];
    }
    if (!list.length) return;

    for (const p of list) {
      // 원하는 자리가 막혀 있으면 **조용히 버리지 않고 빈 자리를 찾는다.**
      // 예전에 디렉터 프롭이 가구와 겹쳐 소리 없이 사라진 적이 있다 (PROGRESS 7/31).
      // 좌표를 손으로 맞추는 대신 여기서 흡수한다 — 붙박이는 매일 서야 하므로
      const free = (s) => s && this.built.collision[s.y][s.x] === 0;
      const slot = [slots.find((s) => s.id === p.slot), ...slots].find(free);
      if (!slot) continue;                                       // 이 공간에 설 자리가 없다

      const look = ['person', 'animal', 'object'].includes(p.look) ? p.look : 'object';
      const bottom = ROOM_TOP + (slot.y + 1) * TILE;
      const sprite = this.add.image(slot.x * TILE, bottom, `prop-${look}`)
        .setOrigin(0, 1).setDepth(bottom + 1);
      this.layer.add(sprite);

      // 호감도는 **그 사람 머리 위에만** 뜬다. 상태창에 목록으로 모아두면
      // 채워야 할 게이지처럼 보이고, 그러면 사람이 아니라 숫자를 보게 된다
      if (p.npc) {
        const v = affinityOf(this.affinity, p.npc);
        const heart = this.add.text(slot.x * TILE + TILE / 2, bottom - TILE * 1.5 - 3,
          `♥ ${v}`, {
            fontFamily: 'monospace', fontSize: '8px', resolution: 1,
            color: v >= 70 ? '#ffd447' : v >= 45 ? '#c9b799' : '#8a7c6b',
            stroke: '#1a1714', strokeThickness: 3,
          }).setOrigin(0.5, 1).setDepth(bottom + 2);
        this.layer.add(heart);
        p.heart = heart;
      }

      this.built.collision[slot.y][slot.x] = 1;                  // 통과 불가 — 다가가야 만난다
      // 자리를 옮겼을 수 있으므로 **실제로 선 자리**로 키를 만든다.
      // 원하던 자리로 만들면 둘이 같은 키를 갖는 날이 생긴다
      const key = `${this.mapId}:prop:${slot.id}`;
      this.propNames.set(key, p.name);                           // 관측 기록에 이름으로 남게
      this.props.push({ ...p, look, key, x: slot.x, y: slot.y, w: 1, h: 1, sprite,
        met: this.metProps.has(key) });
    }
  }

  /** 오늘 이 공간에 찾아온 사람들을 세운다. 자리가 막혔으면 옆으로 옮긴다 */
  drawVisitors() {
    for (const v of this.visitors ?? []) {
      if (v.map && v.map !== this.mapId) continue;
      v.map ??= this.mapId;

      let spot = { x: v.x, y: v.y };
      if (this.built.collision[spot.y]?.[spot.x] !== 0) {
        const [alt] = freeSpots(this.built, { near: spot, exclude: [{ x: this.gx, y: this.gy }] });
        if (!alt) continue;                        // 설 데가 없으면 오늘은 못 온 것으로
        spot = alt;
      }
      v.x = spot.x; v.y = spot.y;

      const bottom = ROOM_TOP + (spot.y + 1) * TILE;
      const sprite = this.add.image(spot.x * TILE, bottom, 'prop-person')
        .setOrigin(0, 1).setDepth(bottom + 1);
      this.layer.add(sprite);
      this.built.collision[spot.y][spot.x] = 1;

      const key = `${this.mapId}:visit:${v.name}`;
      this.propNames.set(key, v.name);
      const p = { ...v, look: 'person', key, w: 1, h: 1, sprite, visitor: true,
        met: this.metProps.has(key) };
      this.props.push(p);

      if (v.npc) {
        const val = affinityOf(this.affinity, v.npc);
        const heart = this.add.text(spot.x * TILE + TILE / 2, bottom - TILE * 1.5 - 3,
          `♥ ${val}`, {
            fontFamily: 'monospace', fontSize: '8px', resolution: 1,
            color: val >= 70 ? '#ffd447' : val >= 45 ? '#c9b799' : '#8a7c6b',
            stroke: '#1a1714', strokeThickness: 3,
          }).setOrigin(0.5, 1).setDepth(bottom + 2);
        this.layer.add(heart);
        p.heart = heart;
      }
    }
  }

  propAt(x, y) {
    return this.props?.find((p) => p.x === x && p.y === y) ?? null;
  }

  /**
   * 프롭에 다가간다. 대사는 미리 없다 — `detail`을 먼저 보여주고 그 사이에 만든다.
   * 읽는 동안 생성이 끝나므로 기다림이 연출로 덮인다.
   */
  approachProp(p) {
    const already = this.metProps.has(p.key);
    this.observer.act(p.key, `${this.placeLabel()}의 ${p.name}`, this.clock.label, 'approach');
    this.metProps.add(p.key);
    this.talkingProp = p;         // 자유 입력의 호감도가 누구에게 가는지
    // **여기서 상대가 정해진다.** 이후 대사 텍스트로 안 바꾼다.
    // kind는 어느 AI가 답할지도 정한다 — 거울은 mirror, 나머지는 npc-reply
    this.beginTalk(p, p.isMirror ? 'mirror' : 'prop');
    // 오늘 이 사람이 부탁할 게 있으면 여기서 듣는다. **듣기 전에는 완료되지 않는다**
    const errand = this.hearErrands(p.npc);
    p.met = true;

    if (p.isMirror) { this.talkToMirror(p); return; }   // 마지막 장면은 다른 AI가 맡는다

    // **두 번째부터는 그냥 대화다.** writer를 다시 부르면 오늘의 장면이 또 시작되고,
    // 그건 처음 만난 것처럼 구는 것이다. 이어서 말을 거는 것이므로 npc-reply로 간다
    if (already) {
      this.dialogue.play(
        { lines: [{ speaker: p.name, text: '…' }], choices: [], keepOpen: true },
        () => {}, { pending: true, speaker: p.name, onGiveUp: () => this.endTalk() },
      );
      this.speak('(다시 말을 건다)', false);
      return;
    }

    // **찾아온 사람은 대본을 들고 왔다.** 정산 때 writer가 이미 써둔 것이라
    // 여기서 실시간 호출이 없다 — 다가가면 곧바로 말이 시작된다
    if (p.visitor && p.script?.lines?.length) {
      this.dialogue.play({ ...p.script, keepOpen: true },
        (choice) => this.recordPropTalk(p, p.script, choice), { speaker: p.name });
      return;
    }

    // `detail`부터 한 자씩 띄운다. 다 읽을 때쯤 생성이 끝나 대기가 연출로 덮인다.
    // pending — 이 줄이 끝나도 닫지 않고 뒷말을 기다린다.
    this.dialogue.play(
      { lines: [{ speaker: p.name, text: p.detail || '…' }], choices: [] },
      () => {},
      // 답이 안 오면 스스로 빠져나온다. 안 그러면 대화창이 열린 채 게임이 멈춘다
      { pending: true, onGiveUp: () => this.recordPropTalk(p, { lines: [] }, null) }
    );

    fetch('/api/agent/writer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: {
          kind: 'scene', at: this.clock.label, target: p.target ?? 'none',
          purpose: `무대 접촉 — ${p.signal ?? 'behavior'} 신호`,
          signal_wanted: [p.signal ?? 'behavior'],
          // 붙박이 인물에게는 대사가 없다 — 여기 상황만 넘기고 **말은 매번 새로 쓰인다**.
          // 여기에 대사를 박으면 7/31에 걷어낸 고정 NPC 구조로 돌아간다 (game/residents.js)
          beat: (p.resident
            ? `${p.detail} ${timeBand(this.clock.minutes)}이다.`
            : (p.opening || p.detail || p.name))
            // 부탁이 있으면 **대사 안에서** 꺼내게 한다. 문장은 디렉터가 썼고 말투는 writer가 만든다.
            // 대가는 없다 — 들어줄지 말지는 플레이어가 정하고, 안 하는 것도 자료다
            + (errand ? ` 이 사람이 오늘 부탁할 게 있다: "${errand.text}". 대가는 걸지 않는다.` : ''),
        },
        cast: this.cast,
        context: {
          day: this.clock.day, place: this.placeLabel(),
          avoidance: this.table?.avoidance?.pattern,
          // 사이가 얼마나 됐는지에 따라 말투가 달라야 한다
          affinity: p.npc ? affinityOf(this.affinity, p.npc) : null,
        },
      }),
    })
      .then((r) => r.json())
      .then((out) => {
        if (out.error || !this.dialogue.open) throw new Error(out.error ?? 'closed');
        this.dialogue.continueWith({ ...out.data, keepOpen: true });
        this.dialogue.onDone = (choice) => this.recordPropTalk(p, out.data, choice);
      })
      .catch((e) => {
        // 실패해도 막지 않는다. 다만 **갑자기 닫지 않는다** — 읽던 글이 사라지면 버그로 보인다.
        console.warn('[prop]', e.message);
        if (this.dialogue.open) {
          this.dialogue.endWith(p.name, p.detail || '…', () => this.recordPropTalk(p, { lines: [] }, null));
        } else {
          this.recordPropTalk(p, { lines: [] }, null);
        }
      });
  }

  // ── 거울 — 마지막 장면 ──────────────────────────────────
  //
  // 골 맵에 있는 사람은 플레이어와 같은 모양이다. 같은 것을 좋아하고 같은 자리에서 멈춘다.
  // 사람은 자기 문제를 자기한테는 못 풀어주지만 **같은 처지의 남에게는 풀어준다** —
  // 플레이어가 이 사람에게 해주는 말이 곧 자기가 자기한테 하는 말이 된다.
  //
  // 4턴이면 끝나고, 끝나면 붕괴가 예약된다.

  talkToMirror(p, message = null) {
    this.mirrorTurn = (this.mirrorTurn ?? 0) + 1;
    const first = this.mirrorTurn === 1;

    // 첫 턴은 `opening`을 띄워두고 그 사이에 생성한다. 이후 턴은 `…`로 기다린다
    this.dialogue.play(
      { lines: [{ speaker: p.name, text: first ? (p.opening || p.detail || '…') : '…' }], choices: [] },
      () => {},
      { pending: true, onGiveUp: () => this.afterMirror(p, { lines: [] }, null) }
    );

    fetch('/api/agent/mirror', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mirror: MAPS[GOAL_ID]?.mirror ?? p,
        turn: this.mirrorTurn,
        history: this.mirrorLog ?? [],
        message: message ?? '(다가왔다)',
      }),
    })
      .then((r) => r.json())
      .then((out) => {
        if (out.error || !this.dialogue.open) throw new Error(out.error ?? 'closed');
        this.dialogue.continueWith(out.data);
        this.dialogue.onDone = (choice) => this.afterMirror(p, out.data, choice);
      })
      .catch((e) => {
        console.warn('[mirror]', e.message);
        if (this.dialogue.open) {
          this.dialogue.endWith(p.name, p.opening || p.detail || '…', () => this.afterMirror(p, { lines: [] }, null));
        } else {
          this.afterMirror(p, { lines: [] }, null);
        }
      });
  }

  /** 거울의 한 턴이 끝났다. 4턴을 채웠으면 붕괴를 예약한다. */
  afterMirror(p, script, choice) {
    this.recordListening(choice, p.name);
    this.mirrorLog ??= [];
    for (const l of script.lines ?? []) {
      this.mirrorLog.push({ speaker: l.speaker, text: l.text });
      this.dialogueLog.push({ at: this.clock.label, speaker: l.speaker, text: l.text, from: '거울' });
    }
    if (choice) {
      this.mirrorLog.push({ speaker: '나', text: choice.text });
      // 이 사람이 남에게 해준 말. 나중에 현실 전환에서 그대로 되돌려줄 문장이다
      this.dialogueLog.push({
        at: this.clock.label, from: '거울',
        player: { choice: choice.id, text: choice.text, reads_as: choice.reads_as },
      });
    }
    this.lastAction = `${p.name} — ${choice?.text ?? '…'}`;

    const done = script.ending || this.mirrorTurn >= 4 || !choice;
    if (!done) {
      this.talkToMirror(p, choice.text);
      return;
    }

    // 여기가 게임의 끝이다. 다음 기상부터 모든 행동이 +0이 된다 (DESIGN.md §3 Act 3)
    this.collapseNext = true;
    p.met = true;
    this.refresh();
    this.persist();
  }

  /** 대화 하나가 끝났다. 얼마나 들었는지, 자기 얘기를 했는지 담는다 (listening.js). */
  recordListening(choice, to) {
    this.observer.listen(this.dialogue.lastAttention, this.clock.label);
    this.dialogue.lastAttention = null;
    // 선택지는 남이 써준 말이다. **직접 친 것만** 자기 얘기로 센다
    if (choice?.typed && choice.text) {
      this.observer.tell(discloses(choice.text, this.typedBaseline ?? 0), this.clock.label, to);
    }
  }

  /**
   * 플레이어가 직접 친 문장. **이 게임이 받아내려는 것.**
   *
   * 원문을 그대로 남기고(요약 금지 — CLAUDE.md), 자기 개방인지 코드가 표식으로 센다.
   * 그 다음 상대가 답하고, 대화가 이어진다.
   */
  sayFreely(text) {
    this.speak(text, true);
  }

  /**
   * 상대에게 무언가 말한다. **선택지를 고른 것도 여기로 온다.**
   *
   * 예전에는 선택지를 고르면 대화가 거기서 끝났다. 그래서 한창 이어져야 할 때
   * 툭 끊겼다 — 이 게임이 받아내려는 게 정확히 그 이어지는 말인데.
   * 이제 무엇을 말하든 상대가 답하고, 끝내는 건 플레이어가 `(그만 얘기한다)`를
   * 고를 때뿐이다.
   *
   * @param {string} text 플레이어가 말한 것
   * @param {boolean} typed 직접 쳤는가. 선택지를 고른 것과는 신호의 무게가 다르다
   */
  speak(text, typed) {
    if (!text) return;
    // 거울은 전용 AI가 맡는다. 여기서 npc-reply로 새면 마지막 장면이 통째로 어긋난다
    if (this.talkingWith?.kind === 'mirror' && this.talkingProp) {
      this.mirrorLog = [...(this.mirrorLog ?? []), { speaker: '나', text }];
      this.dialogueLog.push({ at: this.clock.label, from: '거울', player: { choice: null, text, typed } });
      if (typed) this.observer.tell(discloses(text, this.typedBaseline ?? 0), this.clock.label, this.partnerName);
      this.talkToMirror(this.talkingProp, text);
      return;
    }

    // **상대는 다가간 순간 정해졌다.** 대사 첫 줄의 화자에서 다시 읽으면
    // writer가 쓴 이름에 따라 상대가 바뀐다 — 노숙자와 얘기하다 친구가 답했다
    const to = this.partnerName;

    // 자기 개방은 **직접 친 문장에서만** 센다. 남이 써준 선택지를 고른 건
    // 자기 말이 아니다 (listening.js와 같은 근거)
    if (typed) {
      this.observer.tell(discloses(text, this.typedBaseline ?? 0), this.clock.label, to);
      this.raiseAffinity(this.talkingProp, 'spoke');
    }
    this.dialogueLog.push({ at: this.clock.label, player: { choice: null, text, typed }, to });
    // 이력은 넉넉히 남긴다 — 짧게 자르면 상대가 방금 한 말을 잊는다
    this.chatLog = [...(this.chatLog ?? []), { speaker: '나', text }].slice(-CHAT_MEMORY);

    // 내가 한 말을 먼저 보여주고, 그 사이에 답을 만든다
    this.dialogue.play(
      { lines: [{ speaker: '나', text }], choices: [] },
      () => {},
      {
        pending: true,
        speaker: to,
        // 답이 안 와도 **내가 한 말은 이미 기록됐다.** 조용히 닫고 게임을 돌려준다 —
        // 답장이 없는 것도 이 게임에서는 흔한 일이고, 그 자체가 자료다
        onGiveUp: () => { this.lastAction = `${to ?? '상대'} — 답이 없다`; this.refresh(); },
      },
    );

    fetch('/api/agent/npc-reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        npc: this.partnerOf(),
        context: { day: this.clock.day, at: this.clock.label, place: this.placeLabel() },
        history: this.chatLog,
        message: text,
      }),
    })
      .then((r) => r.json())
      .then((out) => {
        if (out.error || !this.dialogue.open) throw new Error(out.error ?? 'closed');
        for (const l of out.data.lines ?? []) {
          this.chatLog.push({ speaker: l.speaker, text: l.text });
          this.dialogueLog.push({ at: this.clock.label, speaker: l.speaker, text: l.text, from: '채팅' });
        }
        // 말한 것이 실제로 일어난다 — 잠시 뒤에 (game/effects.js)
        this.promise(out.data.effect);
        // **이 사람도 대화를 끝낼 수 있다.** 플레이어만 끝낼 수 있으면 억지로 이어진다
        const ends = out.data.ending === true;
        this.dialogue.continueWith({ ...out.data, keepOpen: !ends, choices: ends ? [] : out.data.choices });
        this.dialogue.onDone = (choice) => {
          if (ends) { this.lastAction = `${to ?? '상대'} — 대화가 끝났다`; this.endTalk(); this.refresh(); return; }
          this.afterReply(choice, to);
        };
      })
      .catch((e) => {
        console.warn('[npc-reply]', e.message);
        // 답이 없어도 내가 한 말은 남는다. 갑자기 닫지 않는다
        if (this.dialogue.open) this.dialogue.endWith('나', text, () => this.refresh());
      });
  }

  /** 이름으로 배역을 찾는다. 없으면 이름만 넘긴다 — 무대 프롭일 수 있다. */
  castOf(name) {
    return (this.cast ?? []).find((c) => c.name === name)
      ?? { name: name ?? '상대', relation: '지금 말을 섞고 있는 사람', tone: '평범하다' };
  }

  // ── 지금 누구와 말하고 있는가 ───────────────────────────
  //
  // **한 번 정해지면 대화가 끝날 때까지 안 바뀐다.**
  //
  // 예전에는 매 턴 `script.lines[0].speaker`에서 다시 읽었다. 그런데 그 이름은
  // writer가 매번 새로 쓰는 문자열이라, 공원에서 노숙자와 얘기하는 중에
  // writer가 첫 줄 화자를 '지훈'으로 적으면 **그다음부터 지훈이 답했다.**
  // 상대는 텍스트에서 유도할 게 아니라 다가간 순간 못 박아야 하는 값이다.

  /** @param {{npc?:string|null, name:string}} who @param {'prop'|'phone'|'mirror'} kind */
  beginTalk(who, kind = 'prop') {
    this.talkingWith = { npc: who?.npc ?? null, name: who?.name ?? '상대', kind };
    return this.talkingWith;
  }

  endTalk() {
    this.talkingWith = null;
  }

  /** 지금 상대의 이름. 대화 중이 아니면 null */
  get partnerName() {
    return this.talkingWith?.name ?? null;
  }

  // ── 말한 것이 실제로 일어난다 ───────────────────────────
  //
  // "방으로 가져다 줄게" → 잠시 뒤 방에 밥상이 생긴다.
  // 말이 말로만 끝나면 대화를 할 이유가 줄고, 이 게임은 대화를 받아내려고 만든 것이다.
  //
  // **곧바로 일어나지 않는다.** 말하자마자 물건이 생기면 마술이고,
  // "이따 놓을게"는 이따 일어나야 약속이 된다 (game/effects.js).

  /** 상대가 한 약속을 받아둔다. 코드가 못 알아먹는 건 조용히 버린다 */
  promise(raw) {
    const e = effects.accept(raw, {
      maps: [...mapList(), 'room'],
      npcs: NPC_IDS,
      at: this.clock.minutes,
    });
    if (!e) return;
    (this.pending ??= []).push(e);
  }

  /** 시각이 된 약속을 지킨다 */
  keepPromises() {
    if (!this.pending?.length) return;
    const { ready, rest } = effects.due(this.pending, this.clock.minutes);
    this.pending = rest;
    for (const e of ready) this.apply(e);
  }

  apply(e) {
    if (e.kind === 'give') {
      this.bag = { ...this.bag, [e.item]: (this.bag[e.item] ?? 0) + 1 };
      this.overlay.popNotice(`${itemLabel(e.item)}을(를) 받았다`);
    } else if (e.kind === 'place') {
      // 그 공간에 하나 놓인다. 지금 거기 서 있으면 눈앞에 생긴다
      (this.placed ??= []).push({ map: e.map, type: e.what, note: e.note });
      if (e.map === this.mapId) this.buildMap({ x: this.gx, y: this.gy });
      this.overlay.popNotice(effects.line(e));
    } else if (e.kind === 'move') {
      // 그 사람이 그 공간으로 간다. 오늘 남은 시간 동안 거기 있다
      (this.moved ??= []).push({ npc: e.who, map: e.map });
      this.overlay.popNotice(effects.line(e));
    }
    this.lastAction = effects.line(e);
    this.persist();
    this.refresh();
  }

  // ── 찾아오는 사람 ───────────────────────────────────────
  //
  // 지금까지 세상은 **플레이어가 가야만** 움직였다 — 폰 앞으로 걸어가거나
  // NPC에게 다가가야 무슨 일이 생겼다. 그런데 현실은 안 그렇다.
  // 방에 있는데 엄마가 문을 두드리고, 아무것도 안 하고 있는데 친구가 찾아온다.
  //
  // **거절할 수는 있어도 온 것 자체를 못 본 척할 수는 없다.** 그게 폰과 다른 점이고,
  // 그래서 폰이 재는 신호(열까 말까)와 다른 걸 잰다 — 앞에 있는 사람을 어떻게 하는가.

  /**
   * 지금 있는 곳으로 누가 찾아온다. 설 자리가 없으면 실패하고 폰으로 떨어진다.
   * @returns {boolean} 실제로 왔는가
   */
  receiveVisit(due) {
    const who = due.script?.lines?.[0]?.speaker ?? due.event?.target ?? '누군가';
    const taken = [
      { x: this.gx, y: this.gy },
      ...(this.props ?? []).map((p) => ({ x: p.x, y: p.y })),
    ];
    // 플레이어 근처에 선다 — 방 건너편에 세우면 찾아온 게 아니라 놓여 있는 게 된다
    const [spot] = freeSpots(this.built, { near: { x: this.gx, y: this.gy }, exclude: taken });
    if (!spot) return false;

    this.visitors.push({
      npc: this.npcIdOf(who),
      name: who,
      look: 'person',
      detail: due.script?.lines?.[0]?.text ?? '문 앞에 서 있다.',
      // **대본이 이미 있다.** 정산 때 writer가 써둔 것이므로 다가가도 실시간 호출이 없다
      script: due.script,
      event: due.event,
      visitedAt: this.clock.label,
      x: spot.x, y: spot.y,
    });

    this.buildMap({ x: this.gx, y: this.gy });     // 지금 자리를 지킨 채 다시 세운다
    this.overlay.popNotice(`${who}이(가) 찾아왔다`, '#ffd447');
    this.lastAction = `${who} — 찾아왔다 (${this.clock.label})`;
    this.observer.notify(due.id, who, this.clock.label);
    // 폰과 달리 **온 순간 이미 본 것이다.** 지연은 여는 데 걸린 시간이 아니라
    // 말을 섞기까지 걸린 시간이 된다
    this.refresh();
    return true;
  }

  /** 이름으로 호감도 키를 찾는다. 모르는 사람이면 null — 그래도 대화는 된다 */
  npcIdOf(name) {
    for (const [id, n] of this.npcNames ?? []) if (n === name) return id;
    return NPC_NAME_TO_ID[name] ?? null;
  }

  /**
   * npc-reply에 넘길 상대. **cast에 없는 사람도 제대로 넘어가야 한다** —
   * 노숙자·길고양이·오늘의 프롭은 캐스팅 목록에 없고, 이름만 넘기면
   * 모델이 아는 사람(친구·엄마) 중 하나로 흘러간다.
   */
  partnerOf() {
    const w = this.talkingWith;
    if (!w) return this.castOf(null);
    const known = (this.cast ?? []).find((c) => c.name === w.name);
    if (known) return { ...known, situation: this.situationOf(w.name) };
    return {
      name: w.name,
      relation: w.npc === 'cat' ? '길에서 마주친 동물' : '오늘 이 자리에서 마주친 사람',
      tone: '이 사람으로만 답해라. 다른 등장인물의 이름이나 말투를 빌리지 마라',
      situation: this.situationOf(w.name),
    };
  }

  /** 디렉터가 적어둔 그 인물의 지금 처지 (plan.cast_state) */
  situationOf(name) {
    return (this.plan?.cast_state ?? []).find((c) => c.name === name)?.situation ?? null;
  }

  // ── 휴대폰 ──────────────────────────────────────────────

  /**
   * 연락이 도착했다. **대화창을 열지 않는다.**
   * 화면 구석에서 잠깐 알리고 마는 것이 전부다 — 열지 말지는 플레이어가 정한다.
   */
  buzz(m) {
    this.lastAction = `${m.from} — 연락 (${this.phone.unread.length}통 안 읽음)`;
    // **온 걸 모르면 안 온 것과 같다.** 예전에는 DEV 패널에만 적혀서,
    // 방에서 폰 쪽을 안 보고 있으면 연락이 왔는지조차 알 수 없었다.
    // 단 **열지 말지는 여전히 플레이어가 정한다** — 말풍선이 저 혼자 뜨지 않는다
    this.overlay.popNotice(`${m.from} — 연락`, '#9fd8ff');
    this.lightPhone();
    this.refresh();
  }

  /** 안 읽은 게 있으면 폰 화면이 켜져 있다. 방에 들어서면 눈에 띈다 */
  lightPhone() {
    const phone = this.built?.objects?.find((o) => o.type === 'phone' && !o.removed);
    if (!phone) return;
    const want = this.phone.unread.length ? 'lit' : '';
    if (phone.variant !== want) this.paint(phone, want);
  }

  /**
   * 폰을 연다. 가장 오래 기다린 것부터.
   * **여기서 지연이 확정된다** — 몇 시간 만에 열었는지가 reaction 신호의 유일한 출처다.
   */
  openPhone() {
    const m = this.phone.next();
    if (!m) return;
    this.phone.open(m.id, this.clock.label, this.clock.minutes);
    this.observer.open(m.id, this.clock.label, m.delayMin ?? 0);
    this.beginTalk({ npc: null, name: m.from }, 'phone');
    this.lightPhone();          // 다 읽었으면 화면이 꺼진다
    this.playEvent(m.item);
  }

  recordPropTalk(p, script, choice) {
    this.recordListening(choice, p.name);
    for (const l of script.lines ?? []) {
      this.dialogueLog.push({ at: this.clock.label, speaker: l.speaker, text: l.text, from: '무대' });
    }
    this.dialogueLog.push({
      at: this.clock.label,
      player: choice ? { choice: choice.id, text: choice.text, reads_as: choice.reads_as }
        : { choice: null, text: '(그냥 봤다)' },
      for_prop: p.name, place: this.placeLabel(),
      signal_wanted: [p.signal ?? 'behavior'],
      watch: p.watch ?? null,        // 디렉터가 무엇을 보려 했는가 — 해석의 기준
    });
    this.lastAction = `${p.name} — ${choice?.text ?? '봤다'}`;
    // 말을 섞으면 상대 쪽 문이 조금 열린다. **자기 말을 직접 쓴 쪽이 더 크다** —
    // 남이 써준 말을 고르는 것과 자기 말을 만드는 것은 다른 일이다 (game/listening.js와 같은 근거)
    // **대화했다는 것만으로는 안 오른다.** 자기 말을 직접 쓴 것(spoke)만 센다 —
    // 선택지를 고른 건 남이 써준 말을 고른 것이고, 그걸로 마음이 열리지는 않는다
    if (choice?.typed) this.raiseAffinity(p, 'spoke');
    // 고른 말을 그대로 건넨다 — **선택지를 골랐다고 대화가 끝나지 않는다**
    if (choice && !choice.end && !choice.free) { this.speak(choice.text, false); return; }
    if (!choice || choice.end) this.endTalk();
    this.refresh();
  }

  // ── 포인트를 쓰는 자리 ──────────────────────────────────
  //
  // 얻기만 하고 쓸 데가 없으면 숫자는 곧 배경이 된다.
  // **쓰는 것 자체가 목적은 아니다** — 산 것을 누군가에게 건네는 데까지 가야
  // 이 게임이 재려는 것(상대 쪽 문이 열리는가)에 닿는다 (game/shop.js).

  /** 편의점 선반. 대화창을 그대로 쓴다 — 새 UI를 만들면 조작 규칙이 하나 더 늘어난다 */
  openShop() {
    const choices = Object.entries(ITEMS).map(([id, it]) => ({
      id,
      text: `${it.label}  ${it.price}P${this.points < it.price ? '  (모자람)' : ''}`,
    }));
    this.dialogue.play(
      {
        lines: [{ speaker: '진열대', text: `가진 포인트 ${this.points}P.` }],
        choices: [...choices, { id: '__none', text: '그냥 본다' }],
        allowFree: false,   // 진열대에 대고 할 말은 없다 — **AI 대화는 절대 끄지 않는다**
      },
      (choice) => {
        if (!choice || choice.id === '__none' || choice.id === '__free') return;
        const r = buy(this.points, this.bag, choice.id);
        if (!r.ok) { this.lastAction = r.reason; this.refresh(); return; }
        this.points = r.points;
        this.bag = r.bag;
        this.observer.act(`shop:${choice.id}`, `편의점에서 ${itemLabel(choice.id)}`, this.clock.label, 'buy', { why: 'shop', for: null });
        this.lastAction = `${itemLabel(choice.id)} 샀다  −${ITEMS[choice.id].price}P`;
        this.overlay.popNotice(`−${ITEMS[choice.id].price}P`);
        this.persist();
        this.refresh();
      },
      { speaker: '진열대' },
    );
  }

  /**
   * 손에 든 것을 건넨다. **이게 부탁의 다른 얼굴이다** —
   * 말로 부탁받는 것(request)과 아무 말 없이 필요해 보이는 것(wants)의 차이.
   */
  giveTo(p, itemId) {
    const t = take(this.bag, itemId);
    if (!t.ok) return;
    this.bag = t.bag;
    (this.gaveTo ??= new Set()).add(p.key);

    this.observer.act(p.key, `${this.placeLabel()}의 ${p.name}`, this.clock.label, 'give');
    this.dialogueLog.push({
      at: this.clock.label, player: { choice: null, text: `${itemLabel(itemId)}를 건넸다` },
      for_prop: p.name, place: this.placeLabel(),
    });
    this.lastAction = `${p.name}에게 ${itemLabel(itemId)}를 줬다`;
    this.raiseAffinity(p, 'favor');
    this.persist();
    this.refresh();

    // 준 다음에 무슨 일이 생기는지는 AI가 쓴다. 여기 대사를 박지 않는다
    if (!p.met) this.approachProp(p);
  }

  /**
   * 이 식탁에 밥이 차려져 있는가.
   *
   * 두 갈래 — 오늘 집에 차려진 것(residents.js mealAt), 또는 누가 놓아준 것(effects).
   * 오늘 이미 먹었으면 없다.
   */
  hasMeal(obj) {
    if (this.done.has(`${this.mapId}:${obj.id}`)) return false;
    if (obj.placed) return true;                       // 누가 가져다준 밥상
    return mealAt(this.mapId, this.clock.minutes, this.clock.day);
  }

  /** 밥을 먹는다. 허기가 크게 차고 L0 점수가 붙는다 */
  eatMeal(obj) {
    this.vitals = { ...this.vitals, hunger: Math.min(100, (this.vitals.hunger ?? 0) + 45) };
    this.lastAction = '밥 먹기  +10';
    this.persist();
  }

  /** 편의점 취식대 — 산 것을 여기서 먹는다. 살 곳과 먹을 곳이 같은 공간에 있다 */
  openBag() {
    const list = bagList(this.bag).filter((i) => i.eat);
    if (!list.length) {
      this.dialogue.play({
        lines: [{ speaker: '취식대', text: '먹을 게 없다. 선반에서 사 와야 한다.' }],
        choices: [], allowFree: false,   // 진열대에 대고 할 말은 없다 — **AI 대화는 절대 끄지 않는다**
      }, () => {}, { speaker: '취식대' });
      return;
    }
    this.dialogue.play(
      {
        lines: [{ speaker: '취식대', text: '창밖으로 골목이 보인다.' }],
        choices: [
          ...list.map((i) => ({ id: i.id, text: `${i.label}${i.count > 1 ? ` ×${i.count}` : ''} 먹기` })),
          { id: '__none', text: '그만둔다' },
        ],
        allowFree: false,   // 진열대에 대고 할 말은 없다 — **AI 대화는 절대 끄지 않는다**
      },
      (choice) => { if (choice && choice.id !== '__none') this.eat(choice.id); },
      { speaker: '취식대' },
    );
  }

  /** 산 것을 먹는다 — 상태창 수치만 움직인다. 규칙에는 영향 없음 */
  eat(itemId) {
    const it = ITEMS[itemId];
    if (!it?.eat || !has(this.bag, itemId)) return false;
    const t = take(this.bag, itemId);
    this.bag = t.bag;
    this.vitals = { ...this.vitals, ...Object.fromEntries(
      Object.entries(it.eat).map(([k, v]) => [k, Math.min(100, (this.vitals[k] ?? 0) + v)]),
    ) };
    this.lastAction = `${it.label}  먹었다`;
    this.persist();
    this.refresh();
    return true;
  }

  // ── 호감도 ──────────────────────────────────────────────
  //
  // **NPC가 플레이어에게** 갖는 마음이다. 상대 쪽 문이 얼마나 열렸는지를 잰다.

  /** @param {'talk'|'spoke'|'favor'} kind */
  raiseAffinity(p, kind) {
    if (!p?.npc) return;                                   // 사물·쪽지는 마음이 없다
    // 이름은 **안 움직여도** 적어둔다. 엄마는 100 고정이라 영영 안 움직이는데,
    // 움직일 때만 적으면 상태창에 'mom'이라는 키가 그대로 뜬다
    this.npcNames.set(p.npc, p.name);
    const r = raise(this.affinity, p.npc, kind);
    this.affinity = r.state;
    if (!r.moved) return;                                  // 엄마는 100 고정 — 아무 일도 안 일어난다
    // 머리 위 숫자를 그 자리에서 갱신한다. 다음에 만날 때까지 기다리면 오른 걸 못 본다
    const live = (this.props ?? []).find((x) => x.npc === p.npc && x.heart);
    live?.heart.setText(`♥ ${r.to}`)
      .setColor(r.to >= 70 ? '#ffd447' : r.to >= 45 ? '#c9b799' : '#8a7c6b');
    this.overlay.popAffinity(p.name, r.to);
    this.persist();
  }

  /**
   * 방금 한 행동이 **들은 적 있는** 부탁이었는가.
   *
   * 우연히 한 것은 안 센다 — 만나서 듣지 않은 부탁이 저절로 닫히면
   * "부탁을 들어줬다"가 부풀려지고, 그게 곧 관계 신호의 오염이다 (game/errands.js).
   *
   * **대가는 호감도뿐이다.** 포인트를 주면 "엄마라서 했다"와 "포인트라서 했다"가 섞인다.
   */
  closeErrands(action) {
    const r = errands.complete(this.errands, action, this.clock.label);
    if (!r.closed.length) return;
    this.errands = r.errands;
    for (const e of r.closed) {
      const p = (this.props ?? []).find((x) => x.npc === e.npc);
      if (p) this.raiseAffinity(p, 'favor');
      else this.affinity = raise(this.affinity, e.npc, 'favor').state;   // 그 자리에 없어도 전해진다
      this.lastAction = `${this.npcNames.get(e.npc) ?? e.npc}의 부탁 — ${e.text}`;
    }
    this.persist();
  }

  /** 다가가서 부탁을 들었다. **듣기 전에는 완료되지 않는다** */
  hearErrands(npc) {
    if (!npc) return null;
    const before = errands.openOf(this.errands, npc).length;
    this.errands = errands.ask(this.errands, npc, this.clock.label);
    const open = errands.openOf(this.errands, npc);
    return open.length > before ? open[open.length - 1] : (open[0] ?? null);
  }

  /**
   * 상대가 답한 뒤 플레이어가 고른 것.
   *
   * **선택지를 골랐다고 대화가 끝나지 않는다.** 그 말을 상대에게 건네고 계속 간다 —
   * 끊기는 건 `(그만 얘기한다)`를 고를 때, 또는 답이 끝내 안 올 때뿐이다.
   */
  afterReply(choice, to) {
    this.recordListening(choice, to);
    if (choice?.free) return;                    // 또 직접 말하기 — onInputOpen이 받는다
    if (choice && !choice.end) {                 // 고른 말을 그대로 건넨다. 대화는 이어진다
      this.speak(choice.text, false);
      return;
    }
    this.lastAction = `${to ?? '대화'} — ${choice?.end ? '그만 얘기했다' : '…'}`;
    this.endTalk();
    this.refresh();
  }

  /** 상태창에 띄울 호감도 목록. 만난 적 있는 사람만 */
  affinityList() {
    return affinityLines(this.affinity, Object.fromEntries(this.npcNames ?? []));
  }

  /**
   * 인물별로 **지금까지 쌓인 것.** 디렉터가 `confide`를 짜는 재료다.
   *
   * 고민을 꺼내려면 두 가지가 있어야 한다 — 그 사람과 사이가 됐다는 것(호감도),
   * 그리고 플레이어가 그 사람에게 실제로 한 말(원문). 둘 다 없이 고민을 꺼내면
   * 그건 아무에게나 하는 신세한탄이고, 플레이어가 반응할 이유가 없다.
   *
   * **원문을 그대로 넘긴다.** 요약하면 말투가 사라지고, 말투가 사라지면
   * 그 옆에 놓을 고민을 지을 수가 없다 (CLAUDE.md — 요약 금지).
   */
  bonds() {
    const names = Object.fromEntries(this.npcNames ?? []);
    const told = this.observer?.told ?? [];
    const ids = new Set([...Object.keys(this.affinity ?? {}), ...(this.npcNames?.keys() ?? [])]);

    return [...ids].map((npc) => {
      const name = names[npc] ?? npc;
      const mine = told.filter((t) => t.to === name);
      return {
        npc,
        name,
        affinity: affinityOf(this.affinity, npc),
        // 이 사람에게 **자기 얘기**를 한 적이 있는가. 없으면 아직 고민을 들을 사이가 아니다
        opened: mine.filter((t) => t.self).length,
        said: mine.map((t) => t.text).filter(Boolean).slice(-6),
      };
    }).sort((a, b) => b.affinity - a.affinity);
  }

  // ── 관측 ────────────────────────────────────────────────

  /** 이 공간에서 할 수 있는 일들. "있었는데 안 건드린 것"을 알려면 목록이 필요하다. */
  availableHere() {
    return [
      ...this.built.objects
        .filter((o) => !o.removed && actionFor(o)?.score)
        .map((o) => this.doneKey(actionFor(o))),
      ...(this.props ?? []).map((p) => p.key),      // 오늘 놓인 무대도 기회다
    ];
  }

  /**
   * 이 행동에 실제로 붙는 점수. **붕괴 이후에는 전부 0이다** (DESIGN.md §2).
   *
   * 감점이 아니라 무득점이다. 처벌이 아니라 **게임이 더 이상 아무것도 세지 않는 것**이고,
   * 그 침묵이 이 게임의 메시지다 — 말로 하지 않고 시스템으로 전한다.
   */
  scoreFor(raw) {
    return this.collapsed ? 0 : raw;
  }

  /** 관측 기록에 남는 공간 이름. 목 데이터 라벨이 새지 않게 한 곳에서만 만든다. */
  placeLabel() {
    return this.mapId === 'room' ? '내 방' : (MAPS[this.mapId]?.label ?? this.mapId);
  }

  enterPlace() {
    this.closeErrands?.({ kind: 'visit', target: this.mapId });
    this.placeEnteredAt = this.clock.minutes;
    this.observer.enterPlace(this.placeLabel(), this.clock.label, this.availableHere());
  }

  leavePlace() {
    this.observer.leavePlace(this.clock.label, this.clock.minutes - (this.placeEnteredAt ?? this.clock.minutes));
  }

  /** 관측 키 → 사람이 읽을 이름. 분석 AI가 보는 문자열이다. */
  labelForKey(key) {
    const [mapId, a, b] = key.split(':');
    const place = mapId === 'room' ? '내 방' : MAPS[mapId]?.label ?? mapId;
    if (a === 'prop') {
      const name = this.propNames?.get(key);
      return `${place}의 ${name ?? '무대'}`;
    }
    const type = String((a === 'sleep' ? b : a) ?? '').replace(/_\d+$/, '');
    return `${place}의 ${nameOf({ type })}`;
  }

  /**
   * 바라보는 대상 위에 뜨는 한 줄. **화면 라벨과 DEV 패널이 같은 걸 쓴다** —
   * 갈라지면 디버그가 거짓말을 한다.
   */
  /**
   * 화면에 뜨는 한 줄.
   *
   * **`action`을 받는다.** 예전에는 여기서 `actionFor(obj)`를 다시 불렀는데,
   * 그러면 `currentTarget()`이 상황에 따라 바꾼 행동(편의점 선반 → 사기)이 반영되지 않는다.
   * 실제로 "사기"인 자리에 "보기"라고 떠서 여기서 살 수 있다는 걸 알 방법이 없었다.
   * 라벨과 행동을 두 군데서 만들지 않는다 — 같은 실수를 세 번째 하는 중이었다.
   */
  targetLine(o, done, action = null) {
    if (o.type === 'door') return this.doorLine(o);
    const waiting = o.type === 'phone' ? this.phone.unread.length : 0;
    if (waiting) {
      // **누가 보냈는지가 보여야 연락이 사건이 된다.** 개수만 뜨면 그냥 배지다
      const next = this.phone.next();
      const more = waiting > 1 ? `  외 ${waiting - 1}통` : '';
      return `${next.from}  "${next.preview}"${more}   [Space] 열기`;
    }
    // **넘겨받은 행동을 그대로 쓴다.** 종류별로 특별 처리하면 새 행동이 생길 때마다
    // 여기가 또 갈라진다 — 실제로 '사기'와 '밥 먹기'에서 두 번 겪었다
    if (!action) return promptLine(o, done);
    const name = nameOf(o);
    if (action.verb === 'look') {
      return done ? `${name}   ✓ ${action.label === '보기' ? '봤다' : action.label}`
        : `${name}   [Space] ${action.label}`;
    }
    if (done) return `${name}   ✓ 오늘 완료`;
    const what = action.short ?? action.label;
    return `${name}   [Space] ${what}${action.score ? `  ${action.tier} +${action.score}` : ''}`;
  }

  /** 이 공간의 결. 사진에서 온 내 방은 언제나 실내다. */
  theme() {
    const t = this.mapId === 'room' ? 'indoor' : MAPS[this.mapId]?.theme;
    return THEMES[t] ? t : 'indoor';
  }

  drawFloorAndWalls() {
    const th = this.theme();
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = x * TILE;
        const isWall = y === 0 || y === GRID_H - 1 || x === 0 || x === GRID_W - 1;

        if (!isWall) {
          this.layer.add(this.add.image(px, ROOM_TOP + y * TILE, `floor:${th}`).setOrigin(0, 0).setDepth(-10));
          continue;
        }
        if (y === 0) {
          // 위쪽 벽만 2타일 높이로 세워 그린다 (ART.md §1)
          this.layer.add(
            this.add.image(px, ROOM_TOP + TILE, `wallTop:${th}`).setOrigin(0, 1).setDepth(ROOM_TOP + TILE)
          );
        } else {
          const bottom = ROOM_TOP + (y + 1) * TILE;
          this.layer.add(this.add.image(px, bottom, `wall:${th}`).setOrigin(0, 1).setDepth(bottom));
        }
      }
    }
  }

  drawObjects() {
    // 뒤에 있는 것부터. 같은 줄이면 벽 부착물이 먼저.
    const ordered = [...this.built.objects].sort(
      (a, b) => (a.y + a.h) - (b.y + b.h) || (b.onWall ? 1 : 0) - (a.onWall ? 1 : 0)
    );
    for (const o of ordered) this.paint(o, '');
  }

  /** 오브젝트 스프라이트를 (재)생성한다. variant로 개어진 이불·걷힌 커튼 등을 표현. */
  paint(o, variant) {
    // 공간의 결을 같이 넘긴다 — 공원의 chair는 벤치, 골목의 lamp는 가로등이 된다
    const t = objectTexture(this, o.type, o.w, o.h, o.onWall, o.position, variant, this.theme());
    const bottom = o.onWall && o.y === 0
      ? ROOM_TOP + TILE            // 위쪽 벽면에 박힌다
      : ROOM_TOP + (o.y + o.h) * TILE;

    if (o.sprite) o.sprite.destroy();
    o.sprite = this.add.image(o.x * TILE, bottom, t.key).setOrigin(0, 1).setDepth(bottom + 1);
    o.variant = variant;
    this.layer.add(o.sprite);
  }

  spawnPlayer(at) {
    const { x, y } = at ?? this.built.spawn;
    this.gx = x;
    this.gy = y;
    this.facing = 'down';
    this.moving = false;
    this.stepT = 0;

    this.player = this.add.image(0, 0, 'player-front').setOrigin(0.5, 1);
    this.layer.add(this.player);
    this.placePlayer(x, y, 0);
  }

  placePlayer(gx, gy, bob) {
    const px = gx * TILE + TILE / 2;
    const py = ROOM_TOP + (gy + 1) * TILE;
    this.player.setPosition(px, py - bob).setDepth(py + 2);
  }

  // ── 루프 ────────────────────────────────────────────────

  update(time, delta) {
    this.overlay.stepPops(delta);                 // 팝업은 정산창이 떠도 끝까지 뜬다
    if (this.settling) return;                    // 정산 중에는 시간도 조작도 멈춘다
    if (this.dialogue.open) return;               // 대화 중에도 시계를 세운다 — 읽는 속도가 자원이 되면 안 된다

    const before = this.clock.minutes;
    // 자정은 이제 하루를 끝내지 않는다. **하루는 침대에서 잘 때만 끝난다.**
    // 넘어가는 순간만 한 번 알려주고 시계는 계속 흐른다 (01:00, 02:00…)
    if (this.clock.advance(delta * (this.timeScale ?? 1))) {
      this.lastAction = '자정이 지났다. 아직 자지 않았다';
      this.refresh();
    }
    this.keepPromises();          // 누가 한 약속이 시각이 되면 일어난다
    this.vitals = tickVitals(this.vitals, this.clock.minutes - before);   // 표시용. 규칙엔 영향 없음
    this.overlay.drawHud(this.clock, this.todayScore, this.total, this.aiError, this.points);
    this.overlay.drawStatus(this.vitals, bagList(this.bag));

    // 시각이 되면 이벤트가 도착한다. **두 가지 방식이 있다:**
    //
    //   폰이 울린다   연락. 열지 말지를 플레이어가 고른다 (delay_min이 곧 reaction 신호)
    //   찾아온다      친구가 집에 오고 엄마가 방문을 두드린다. 거절할 수는 있어도
    //                 **온 것 자체를 못 본 척할 수는 없다**
    //
    // 전부 폰으로만 오면 플레이어가 폰 앞에 가야만 세상이 움직인다. 현실은 안 그렇다.
    const due = this.schedule?.due(this.clock.minutes);
    if (due) {
      this.schedule.markPlayed(due.id);
      if (due.event?.kind === 'visit' && this.receiveVisit(due)) {
        // 찾아왔다 — 폰에는 안 쌓인다
      } else {
        const m = this.phone.arrive(due, this.clock.label, this.clock.minutes);
        this.observer.notify(m.id, m.from, m.at);
        this.buzz(m);
      }
    }

    if (this.moving) {
      this.stepT += delta;
      const k = Math.min(1, this.stepT / STEP_MS);
      const px = Phaser.Math.Linear(this.from.x, this.to.x, k) * TILE + TILE / 2;
      const py = ROOM_TOP + (Phaser.Math.Linear(this.from.y, this.to.y, k) + 1) * TILE;
      const bob = k > 0.2 && k < 0.8 ? 1 : 0;   // 걷기 바운스 1px
      this.player.setPosition(px, py - bob).setDepth(py + 2);

      if (k >= 1) {
        this.moving = false;
        this.gx = this.to.x;
        this.gy = this.to.y;
        this.refresh();
      }
    } else {
      const dir = this.readInput() ?? this.queued;  // 홀드는 연속 이동, 아니면 큐에 담긴 탭 1회
      this.queued = null;
      if (dir) this.tryStep(dir);
    }

    this.blinkCue(time, delta);
  }

  readInput() {
    const k = this.keys;
    if (k.up.isDown || k.w.isDown) return 'up';
    if (k.down.isDown || k.s.isDown) return 'down';
    if (k.left.isDown || k.a.isDown) return 'left';
    if (k.right.isDown || k.d.isDown) return 'right';
    // 이동 패드를 누르고 있는 것도 키를 누르고 있는 것과 같다 (ui/touch.js).
    // 반복은 여기 폴링이 만든다 — 패드 쪽은 방향이 바뀔 때만 말을 건넨다
    return this.touch?.held ?? null;
  }

  tryStep(dir) {
    const d = DIRS[dir];
    const changed = this.facing !== dir;
    this.facing = dir;
    this.player.setTexture(d.tex).setFlipX(d.flip);

    const nx = this.gx + d.dx;
    const ny = this.gy + d.dy;
    if (!this.walkable(nx, ny)) {
      if (changed) this.refresh();   // 막혀도 방향이 바뀌면 대상이 달라진다
      return;
    }

    this.from = { x: this.gx, y: this.gy };
    this.to = { x: nx, y: ny };
    this.stepT = 0;
    this.moving = true;
  }

  walkable(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    return this.built.collision[y][x] === 0;
  }

  // ── 상호작용: 키 하나, 대상은 시선이 정한다 ──────────────

  objectAt(x, y) {
    return this.built.objects.find(
      (o) => !o.removed && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h
    );
  }

  /** 바라보는 칸 우선, 없으면 발밑. 문처럼 밟고 설 수 있는 것을 위해. */
  currentTarget() {
    const d = DIRS[this.facing];
    const nx = this.gx + d.dx;
    const ny = this.gy + d.dy;

    // 무대 프롭이 먼저다 — 오늘 놓인 것이 늘 있던 가구보다 눈에 띈다
    const prop = this.propAt(nx, ny);
    if (prop) {
      // 손에 그 사람이 원하는 게 있으면 행동이 **주기**로 바뀐다.
      // 침대와 같은 규칙 — 바라보는 대상의 *상태*가 행동을 정한다 (CLAUDE.md).
      // 이미 만난 상대에게도 줄 수 있다. 말은 하루 한 번이지만 주는 건 별개다
      const gift = prop.wants && !this.gaveTo?.has(prop.key)
        ? wantedFrom(this.bag, prop.wants) : null;
      if (gift) {
        return {
          prop, obj: prop, gift,
          action: { key: prop.key, verb: 'give', label: `${itemLabel(gift)} 주기`, short: '주기', tier: null, score: 0 },
          done: false, blocked: null,
        };
      }
      return {
        prop,
        obj: prop,
        // **한 번 말했다고 잠기지 않는다.** 다시 말을 걸 수 있어야 계속 털어놓는다.
        // 두 번째부터는 '다시 말 걸기' — writer를 또 부르지 않고 곧장 대화로 간다
        action: { key: prop.key, verb: 'approach', tier: null, score: 0,
          label: prop.met ? `${prop.name}에게 다시` : prop.name,
          short: prop.met ? '다시 말 걸기' : '다가가기' },
        done: false,
        blocked: null,
      };
    }

    const ahead = this.objectAt(nx, ny);
    const obj = ahead ?? this.objectAt(this.gx, this.gy);
    if (!obj) return null;

    // 행동이 없는 사물도 반환한다 — 이름은 보여줘야 하므로
    let action = actionFor(obj);
    // 편의점 선반·취식대는 `보기`가 아니라 **사기·먹기**라고 말해야 한다.
    // 라벨과 실제 행동이 다르면 플레이어는 여기서 살 수 있다는 걸 영영 모른다
    if (action?.verb === 'look' && this.mapId === 'store') {
      if (obj.type === 'shelf') action = { ...action, label: `사기  (${this.points}P)` };
      else if (obj.type === 'table') action = { ...action, label: '먹기' };
    }
    // 집 식탁에 밥이 차려져 있으면 먹을 수 있다. 누가 놓아준 밥상도 마찬가지 —
    // **부탁이 아니라 그냥 있는 것이다.** 먹어도 호감도는 안 오르고, 안 먹은 것은 관측에 남는다
    if (obj.type === 'table' && this.hasMeal(obj)) {
      action = { key: obj.id, verb: 'eat_meal', label: '밥 먹기', short: '먹기', tier: 'L0', score: 10 };
    }
    // 취침 시각 제한은 없앴다. 몇 시든 이불만 개어져 있으면 잘 수 있다 (clock.js SLEEP_ANYTIME)
    return {
      obj, action,
      done: !!action && this.done.has(this.doneKey(action)),
      blocked: null,
    };
  }

  interact() {
    const t = this.currentTarget();
    if (!t || !t.action || t.done || t.blocked) return;

    if (t.gift) { this.giveTo(t.prop, t.gift); return; }   // 손에 든 걸 건넨다
    if (t.prop) {                   // 오늘의 무대에 다가간다
      this.approachProp(t.prop);
      return;
    }
    // 편의점 — 선반에서 사고, 취식대에서 먹는다
    if (t.action.verb === 'look' && this.mapId === 'store') {
      if (t.obj.type === 'shelf') { this.openShop(); return; }
      if (t.obj.type === 'table') { this.openBag(); return; }
    }

    // 이동과 취침은 점수 행동이 아니다 — 하루 1회 규칙(done)에 넣지 않는다.
    // 문을 done에 넣으면 한 번 지나간 문이 그날 내내 잠긴다.
    if (t.action.verb === 'sleep') {
      this.endDay('sleep');
      return;
    }
    if (t.action.verb === 'eat_meal') this.eatMeal(t.obj);   // 점수는 아래 공통 경로에서 붙는다
    if (t.action.verb === 'go_out') {
      this.travel(t.obj);
      return;
    }
    if (t.action.verb === 'look') {
      // 폰은 열 것이 있으면 그걸 먼저 연다. 없으면 평소처럼 들여다본다
      if (t.obj.type === 'phone' && this.phone.next()) { this.openPhone(); return; }
      this.lookAt(t.obj, t.action);
      return;
    }

    const o = t.obj;
    const cx = o.x * TILE + (o.w * TILE) / 2;
    const cy = (o.onWall && o.y === 0 ? ROOM_TOP + TILE : ROOM_TOP + (o.y + o.h) * TILE) - 6;

    const key = this.doneKey(t.action);
    // **같은 행동도 이유가 다르면 다른 신호다** — 스스로 한 청소인지 시켜서인지
    const deed = { kind: t.action.verb === 'clean' ? 'clean' : t.action.verb, target: o.type };
    const why = errands.whyOf(this.errands, deed);
    this.observer.act(key, `${this.placeLabel()}의 ${nameOf(o)}`, this.clock.label, t.action.verb, why);
    this.done.add(key);
    this.closeErrands(deed);               // 들은 적 있는 부탁이었으면 닫힌다
    const got = this.scoreFor(t.action.score);      // 붕괴 이후엔 0
    this.todayScore += got;
    this.total += got;
    // 점수와 **같이** 포인트가 들어온다. 점수는 기록으로 남고 포인트는 쓰면 준다 (game/shop.js)
    this.points += got * POINT_PER_SCORE;
    this.todayLog.push({ label: t.action.label, tier: t.action.tier, score: got });
    this.lastAction = `${t.action.label}  +${got}`;

    switch (t.action.verb) {
      case 'clean':
        o.removed = true;
        o.sprite.destroy();
        o.sprite = null;
        this.clearCollision(o);
        break;
      case 'make_bed':
        this.paint(o, 'made');
        break;
      case 'open_curtain':
      case 'open_window':
        this.paint(o, 'open');
        this.houseLit = true;       // 하나만 열어도 집 전체가 밝아진다. 다음 날까지
        break;
    }

    this.saveMapState();
    this.overlay.popScore(cx, cy, got);
    this.applyLight();
    if (this.debugG.visible) this.drawDebug();
    this.refresh();
  }

  /**
   * 본다. 점수는 없다 — 그래서 **본 것은 순수하게 보고 싶어서 본 것**이 된다 (ambient.js).
   * 분석가에게는 이게 가장 값싼 대량 신호다: 무엇을 봤고 무엇을 6일째 안 봤는가.
   */
  lookAt(o, action) {
    const key = this.doneKey(action);
    const name = nameOf(o);
    this.observer.act(key, `${this.placeLabel()}의 ${name}`, this.clock.label, 'look');
    this.done.add(key);

    // 디렉터가 오늘 문장을 보냈으면 그것을, 없으면 준비된 것을 (DAY 1·오프라인)
    const line = this.ambient?.get(o.type) ?? ambientLine(o.type, this.clock.day, o.id ?? 0);
    this.lastAction = `${name} 봤다`;

    this.dialogue.play({ lines: [{ speaker: name, text: line ?? '별거 없다.' }], choices: [] }, () => {
      this.refresh();
    });
    // 원문 그대로 쌓는다. 무엇을 보고 무엇을 안 봤는지가 회피의 지도다
    this.dialogueLog.push({
      at: this.clock.label, speaker: name, text: line ?? '', kind: 'look', place: this.placeLabel(),
    });
    this.refresh();
  }

  clearCollision(o) {
    for (let j = o.y; j < o.y + o.h; j++) {
      for (let i = o.x; i < o.x + o.w; i++) this.built.collision[j][i] = 0;
    }
  }

  // ── 공간 이동 ───────────────────────────────────────────

  /** 이 문이 어디로 가는가. 방은 사진 맵이라 MAPS에 없어 따로 다룬다. */
  destOf(doorObj) {
    if (!doorObj || doorObj.type !== 'door') return null;
    return this.mapId === 'room' ? ROOM_EXIT : (MAPS[this.mapId]?.exits?.[doorObj.position] ?? null);
  }

  /**
   * 문 위에 뜨는 한 줄. 골목처럼 문이 셋인 곳에서 전부 "현관문"이면 어디가 어딘지 모른다.
   * 그래서 이름 대신 **도착지**를 띄운다.
   */
  doorLine(doorObj) {
    const to = this.destOf(doorObj);
    const dest = MAPS[to];                       // 내 방은 사진 맵이라 여기 없다 — 점수도 없다
    const label = to === 'room' ? '내 방' : dest?.label;
    if (!label) return nameOf(doorObj);
    const got = !dest || this.visited?.has(to);   // 오늘 이미 갔으면 점수 표기를 뗀다
    return `${label}   [Space] 가기${got ? '' : `  ${dest.tier} +${dest.score}`}`;
  }

  /**
   * 문을 열면 그 벽이 가리키는 공간으로. 점수는 문이 아니라 **도착한 공간**에 붙는다 —
   * 문에 붙이면 왔다 갔다 하며 긁을 수 있다.
   */
  travel(doorObj) {
    const from = this.mapId;
    const to = this.destOf(doorObj);
    if (!to || (to !== 'room' && !MAPS[to])) return;

    this.saveMapState();            // 떠나기 전에 지금 상태를 남긴다
    this.leavePlace();
    this.mapId = to;
    this.buildMap();

    // 돌아오는 문 앞에 세운다 — 들어온 방향이 몸에 남는다
    const back = to === 'room' ? this.built.doorTiles[0]?.position : returnWall(from, to);
    const backDoor = back && this.built.doorTiles.find((d) => d.position === back);
    if (backDoor) {
      const f = this.frontOfTile(backDoor);
      if (this.walkable(f.x, f.y)) this.placeAt(f.x, f.y);
    }

    // 점수는 도착한 공간에, 공간마다 하루 1회. 자기 방은 점수가 없다.
    const dest = MAPS[to];
    if (dest && !this.visited.has(to)) {
      this.visited.add(to);
      const got = this.scoreFor(dest.score);
      this.todayScore += got;
      this.total += got;
      this.todayLog.push({ label: `${dest.label} 가기`, tier: dest.tier, score: got });
      this.lastAction = `${dest.label} 가기  +${got}`;
      this.overlay.popScore(this.gx * TILE + TILE / 2, ROOM_TOP + (this.gy + 1) * TILE - 6, got);
    } else {
      this.lastAction = dest ? dest.label : '내 방';
    }

    this.enterPlace();
    this.overlay.drawHud(this.clock, this.todayScore, this.total, this.aiError, this.points);
    this.refresh();
  }

  frontOfTile(t) {
    if (t.y === 0) return { x: t.x, y: 1 };
    if (t.y === GRID_H - 1) return { x: t.x, y: GRID_H - 2 };
    if (t.x === 0) return { x: 1, y: t.y };
    return { x: GRID_W - 2, y: t.y };
  }

  placeAt(x, y) {
    this.gx = x;
    this.gy = y;
    this.moving = false;
    this.placePlayer(x, y, 0);
  }

  // ── 디렉터가 편성한 이벤트 ──────────────────────────────

  /** 예약 시각이 되면 대화가 열린다. 이동은 멈추고 시계도 선다. */
  playEvent(item) {
    this.schedule?.markPlayed(item.id);   // 예약 없이 직접 재생될 수도 있다 (테스트 도구)
    this.cue.clear();
    this.label.setVisible(false);
    this.labelBox.setVisible(false);

    // 연락을 연 것도 사람과의 대화다 — **끝내는 건 플레이어만.**
    // 상대를 여기서 못 박아야 이어지는 말이 엉뚱한 사람에게 안 간다
    const from = item.script.lines?.[0]?.speaker ?? null;
    if (from) this.beginTalk({ npc: this.npcIdOf(from), name: from }, 'phone');

    this.dialogue.play({ ...item.script, keepOpen: true }, (choice) => {
      this.recordListening(choice, from);
      // 원문 그대로 남긴다 — 심리상담 확장의 유일한 자산 (DESIGN.md §4)
      for (const l of item.script.lines) {
        this.dialogueLog.push({ at: this.clock.label, speaker: l.speaker, text: l.text });
      }
      this.dialogueLog.push({
        at: this.clock.label,
        player: choice
          ? { choice: choice.id, text: choice.text, reads_as: choice.reads_as }
          : { choice: null, text: '(무응답)' },
        for_event: item.event.id,
        signal_wanted: item.event.signal_wanted,
      });
      this.lastAction = `${item.event.kind} — ${choice?.text ?? '무응답'}`;
      // 고른 말을 상대에게 건네고 대화를 이어간다. 답장은 여기서부터 npc-reply가 쓴다
      if (choice && !choice.end && !choice.free) { this.speak(choice.text, false); return; }
      if (choice?.end) this.endTalk();
      this.refresh();
    });
    this.refresh();
  }

  /**
   * 오래 도는 작업을 맡기고 결과를 기다린다.
   *
   * 서버가 id만 즉시 주고 백그라운드로 돈다 — 정산은 95초~5분이라 요청 하나로 붙들면
   * 중간 프록시가 먼저 끊는다. 게임은 원래 정산을 안 기다리므로 체감은 그대로다.
   */
  async job(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const started = await r.json();
    if (started.error) throw new Error(started.error);
    if (!started.job) return started;                 // 옛 서버 호환 — 바로 준 응답

    // 4초마다. 최장 10분까지 기다린다
    for (let i = 0; i < 150; i++) {
      await new Promise((done) => setTimeout(done, 4000));
      const out = await (await fetch(`/api/job/${started.job}`)).json();
      if (out.state === 'running') continue;
      if (out.state === 'done') return out;
      throw new Error(out.error ?? '작업 실패');
    }
    throw new Error('작업이 10분을 넘었다');
  }

  /** 디렉터가 무대를 놓을 수 있는 자리. 맵이 늘면 여기에 자동으로 따라온다. */
  placesForDirector() {
    return Object.entries(MAPS).map(([id, m]) => ({
      id, label: m.label, indoor: !!m.indoor,
      slots: (m.slots ?? []).map((s) => s.id),
    }));
  }

  /**
   * DAY 1 무대. 정산은 하루가 끝나야 도니까 첫날은 원래 프롭 0 / 이벤트 0이었다.
   * 캐스팅이 끝나는 즉시(설문 직후) 쏴서, 플레이어가 방을 둘러보는 동안 도착하게 한다.
   */
  fireOpening() {
    if (this.clock.day !== 1 || this.plan || this.openingFired) return;
    this.openingFired = true;

    this.job('/api/opening', { world: this.world, cast: this.cast, places: this.placesForDirector() })
      .then((out) => {
        if (out.error) throw new Error(out.error);
        if (this.clock.day !== 1) return;                    // 늦게 왔으면 그냥 버린다
        this.plan = out.plan;
        this.pendingScripts = out.scripts ?? [];
        this.pendingAmbient = ambientOverrides(out.plan?.ambient);
        this.applySchedule();
        this.buildMap();                                     // 오늘의 프롭을 지금 세운다
        this.aiError = null;
        this.refresh();
      })
      .catch((e) => {
        console.warn('[opening]', e.message);
        // **조용히 넘어가지 않는다.** 여기가 실패하면 1일차에 무대도 이벤트도 0건인데,
        // 예전에는 console에만 적혀서 플레이어는 그냥 "아무 일도 안 일어나는 게임"을 본다.
        // 실제로 배포본 키가 죽은 채 나흘이 흘렀다
        this.aiError = e.message;
        this.refresh();
      });
  }

  /** 하루가 끝나면 정산 파이프라인을 발사한다. **기다리지 않는다** (DESIGN.md §5). */
  fireSettle() {
    const day = this.clock.day;
    const body = {
      day,
      world: this.world,
      table: this.table,
      // 어제 깔아둔 무대·편성. referee가 이걸 기준으로 채점한다
      plan: this.plan ?? null,
      hasGoal: !!MAPS[GOAL_ID],        // 이미 지었으면 다시 만들지 않는다
      today: {
        score: this.todayScore,
        actions: this.todayLog.map((e) => ({ label: e.label, tier: e.tier, score: e.score })),
      },
      dialogue: this.dialogueLog,
      // 반응한 것 · 바라보고 지나친 것 · 아예 안 다가간 것 · 알림 응답 지연
      observed: {
        ...this.observer.summary((k) => this.labelForKey(k)),
        // 끝내 안 연 것도 남는다. 안 열었다는 게 곧 답이다
        notifications: this.phone.summary(),
      },
      history: this.history,
      cast: this.cast,
      // 부탁 — **안 한 것이 빠지면 이 체계를 만든 이유가 없다**
      errands: errands.summary(this.errands),
      // 인물별 호감도 + 그 사람에게 한 말 원문 — 고민(confide)을 지을 재료
      bonds: this.bonds(),
      places: this.placesForDirector(),
    };

    this.settleError = null;
    this.settlePending = true;

    this.settlePromise = this.job('/api/settle', body)
      .then((out) => {
        if (out.error) throw new Error(out.error);
        this.table = out.analysis;
        this.plan = out.plan;
        this.pendingScripts = out.scripts ?? [];
        this.pendingAmbient = ambientOverrides(out.plan?.ambient);
        this.settleUsage = out.total;
        // 골 맵이 왔다 = 가설이 확인됐다. 골목 아래에 없던 문이 생긴다 (Act 3)
        if (out.goal && this.registerGoal(out.goal)) {
          console.log('[goal]', out.goal.label, '—', out.goal.reason);
        }
        this.applySchedule();          // 이미 다음 날이면 즉시 반영
        this.settlePending = false;
        this.aiError = null;
        this.drawSettlement();         // 아직 정산창을 보고 있다면 그 자리에서 갱신된다
        this.refresh();
        this.persist();
        return out;
      })
      .catch((e) => {
        console.warn('[settle]', e.message);
        this.settleError = e.message;
        this.aiError = e.message;
        this.settlePending = false;
        this.drawSettlement();         // 실패도 화면에 적는다. 조용히 실패하면 안 된다
        this.refresh();
        return null;
      });
  }

  /** 편성이 도착했고 새 날이 시작됐으면 예약을 건다. 둘 중 늦게 오는 쪽이 트리거. */
  applySchedule() {
    if (!this.pendingScripts || this.settling) return;
    this.schedule = new Schedule(this.pendingScripts, this.clock.wake);
    // 부탁도 오늘 것으로 갈아끼운다. 못 알아먹는 건 errands.js가 버린다
    this.errands = errands.accept(this.plan?.errands, [...mapList(), 'room'], NPC_IDS);
    this.pendingScripts = null;
    if (this.pendingAmbient) { this.ambient = this.pendingAmbient; this.pendingAmbient = null; }
  }

  /**
   * 하루 종료 = **침대 취침뿐이다** (DESIGN.md §1).
   *
   * 자정 강제 종료를 걷어냈다. 그래야 "잤다"와 "안 잤다"가 갈린다 —
   * 안 자면 시간은 계속 가지만 정산이 안 돌고, 정산이 안 돌면 내일 이벤트도 없다.
   * 벌이 아니라 자야 할 이유다.
   */
  endDay(reason = 'sleep') {
    if (this.settling) return;
    this.settling = true;
    this.sleepMinutes = this.clock.minutes;
    this.clock.stop();

    this.cue.clear();
    this.label.setVisible(false);
    this.labelBox.setVisible(false);
    this.overlay.drawHud(this.clock, this.todayScore, this.total, this.aiError, this.points);   // 멈추기 전 마지막 값

    // 이력을 먼저 챙기고(오늘 재생된 이벤트) 정산을 쏜다
    if (this.schedule) this.history = [...this.history, ...this.schedule.toHistory(this.clock.day)].slice(-8);
    this.fireSettle();

    this.settleShown = {
      day: this.clock.day,
      reason,
      sleepMinutes: this.sleepMinutes,
      log: this.todayLog,
      todayScore: this.todayScore,
      total: this.total,
    };
    this.drawSettlement();
    this.refresh();
  }

  /**
   * 정산창을 그린다. **정산이 끝나면 같은 함수로 다시 그린다** —
   * 플레이어가 이 화면을 보고 있는 95초~5분 동안 디렉터가 읽기를 마치고,
   * 그 결과가 눈앞에서 채워지는 것이 이 게임에서 AI가 보이는 유일한 장면이다.
   */
  drawSettlement() {
    if (!this.settling || !this.settleShown) return;
    this.overlay.showSettlement({
      ...this.settleShown,
      director: settleLines(this.table, {
        pending: this.settlePending,
        error: this.settleError,
        collapsed: this.collapsed,
        collapseNext: this.collapseNext,
        collapsedOn: this.collapsedOn,
        day: this.clock.day,
      }),
    });
  }

  // ── 밝기 ────────────────────────────────────────────────

  applyLight() {
    // 실외와 편의점은 항상 밝다. 집 안만 창문에 좌우된다.
    const indoor = this.mapId === 'room' || MAPS[this.mapId]?.indoor;
    if (!indoor) {
      this.light = 1;
      this.dim.setAlpha(0);
      return;
    }

    // 창문이나 커튼을 하나라도 열면 집 전체가 밝아진다 — 다음 날 아침까지
    if (this.houseLit) {
      this.light = 1;
      this.dim.setAlpha(0);
      return;
    }

    // 열기 전에도 치울수록 조금씩 밝아진다 — 청소가 화면에 남는다
    const live = this.built.objects.filter((o) => !o.removed);
    const cleanables = live.filter((o) => o.cleanable).length;
    const started = this.built.objects.filter((o) => o.cleanable).length;
    const mess = started ? this.baseMessiness * (cleanables / started) : 0;

    this.light = 0.20 - 0.10 * mess;
    this.dim.setAlpha(0.62 * (1 - this.light));
  }

  // ── 대상 표시 ───────────────────────────────────────────

  blinkCue(time, delta = 0) {
    const g = this.cue.clear();
    const t = this.currentTarget();

    // 무엇을 얼마나 바라봤는지 — 바라보고도 안 한 것이 회피의 증거다
    this.observer.look(
      t?.prop ? { key: t.prop.key, name: `${this.placeLabel()}의 ${t.prop.name}` }
        : t?.action?.score ? { key: this.doneKey(t.action), name: `${this.placeLabel()}의 ${nameOf(t.obj)}` }
        : null,
      delta
    );

    if (!t) {
      this.label.setVisible(false);
      this.labelBox.setVisible(false);
      return;
    }

    const o = t.obj;
    const x = o.x * TILE;
    const bottom = o.onWall && o.y === 0 ? ROOM_TOP + TILE : ROOM_TOP + (o.y + o.h) * TILE;
    const top = bottom - (o.sprite?.height ?? TILE);
    const w = o.w * TILE;
    const cx = x + w / 2;
    const pulse = 0.55 + 0.45 * Math.sin((time ?? 0) / 180);

    if (t.blocked) {
      const playerTopB = ROOM_TOP + (this.gy + 1) * TILE - TILE * 1.5;
      this.drawLabel(`${nameOf(o)}   ${t.blocked}`, cx, Math.min(top, playerTopB) - 6);
      return;
    }
    if (t.prop) {                                  // 오늘의 무대 — 이름과 다가가기
      if (!t.done) {
        g.lineStyle(1, 0xffd447, pulse).strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
        const ay = top - 4 - Math.round(pulse * 2);
        g.fillStyle(0xffd447, 0.95).fillTriangle(cx - 4, ay - 5, cx + 4, ay - 5, cx, ay);
      } else {
        g.lineStyle(1, 0x4ade80, 0.5).strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
      }
      const pTop = ROOM_TOP + (this.gy + 1) * TILE - TILE * 1.5;
      // **행동 이름을 여기서 다시 짓지 않는다.** `currentTarget()`이 정한 걸 쓴다 —
      // "다가가기"가 여기 박혀 있어서 '다시 말 걸기'도 '주기'도 안 보였다.
      // 라벨을 세 군데서 만들고 있었고, 그때마다 같은 버그가 났다
      this.drawLabel(
        t.done ? `${t.prop.name}   ✓` : `${t.prop.name}   [Space] ${t.action?.short ?? '다가가기'}`,
        cx, Math.min(top, pTop) - 6
      );
      return;
    }
    if (t.action && !t.done) {
      g.lineStyle(1, 0xffd447, pulse).strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
      const ay = top - 4 - Math.round(pulse * 2);       // 대상 위에 뜨는 작은 화살표
      g.fillStyle(0xffd447, 0.95).fillTriangle(cx - 4, ay - 5, cx + 4, ay - 5, cx, ay);
    } else if (t.action) {
      g.lineStyle(1, 0x4ade80, 0.5).strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
    }

    // 라벨은 플레이어와 대상 중 위쪽에 맞춘다 — 캐릭터를 가리지 않게
    const playerTop = ROOM_TOP + (this.gy + 1) * TILE - TILE * 1.5;
    const line = this.targetLine(o, t.done, t.action);
    this.drawLabel(line, cx, Math.min(top, playerTop) - 6);
  }

  /** 대상 위에 뜨는 한 줄 설명. 90년대 UI처럼 각진 베벨 상자. */
  drawLabel(text, cx, bottomY) {
    this.label.setText(text);

    const pad = 4;
    const w = Math.ceil(this.label.width) + pad * 2;
    const h = Math.ceil(this.label.height) + pad;
    const maxX = GRID_W * TILE;
    const lx = Math.round(Math.min(maxX - w / 2 - 2, Math.max(w / 2 + 2, cx)));  // 화면 밖으로 안 나가게
    const ly = Math.max(h + 26, bottomY);   // HUD 아래로

    this.label.setPosition(lx, ly - Math.floor(pad / 2)).setVisible(true);

    const bx = lx - w / 2;
    const by = ly - h;
    this.labelBox.clear()
      .fillStyle(0x1c1815, 0.92).fillRect(bx, by, w, h)
      .fillStyle(0x5a4f42, 1).fillRect(bx, by, w, 1).fillRect(bx, by, 1, h)
      .fillStyle(0x0f0c0a, 1).fillRect(bx, by + h - 1, w, 1).fillRect(bx + w - 1, by, 1, h)
      .setVisible(true);
  }

  // ── 디버그 오버레이 ─────────────────────────────────────

  drawDebug() {
    const g = this.debugG.clear();

    g.lineStyle(1, 0x4a5568, 0.45);
    for (let x = 0; x <= GRID_W; x++) g.lineBetween(x * TILE, ROOM_TOP, x * TILE, ROOM_TOP + GRID_H * TILE);
    for (let y = 0; y <= GRID_H; y++) g.lineBetween(0, ROOM_TOP + y * TILE, GRID_W * TILE, ROOM_TOP + y * TILE);

    g.fillStyle(0xff4444, 0.22);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.built.collision[y][x] === 1) g.fillRect(x * TILE, ROOM_TOP + y * TILE, TILE, TILE);
      }
    }

    // 남아 있는 점수 기회
    for (const o of this.built.objects) {
      if (o.removed) continue;
      const a = actionFor(o);
      if (!a || !a.score) continue;
      const taken = this.done.has(a.key);
      g.lineStyle(2, taken ? 0x4ade80 : 0xffd447, taken ? 0.5 : 0.9);
      g.strokeRect(o.x * TILE + 1, ROOM_TOP + o.y * TILE + 1, o.w * TILE - 2, o.h * TILE - 2);
    }

    const s = this.built.spawn;
    g.lineStyle(2, 0x60a5fa, 0.8).strokeRect(s.x * TILE + 4, ROOM_TOP + s.y * TILE + 4, TILE - 8, TILE - 8);
  }

  // ── HTML 패널 ───────────────────────────────────────────

  refresh() {
    const el = document.getElementById('objects');
    if (!el) return;

    const b = this.built;
    const t = this.currentTarget();
    const max = potentialScore(b.objects);

    const prompt = !t
      ? '—'
      : !t.action
        ? `${promptLine(t.obj, false)}  (행동 없음)`
        : t.obj.type === 'door' || t.obj.type === 'phone'
          ? this.targetLine(t.obj, t.done, t.action)
        : t.done
          ? `${t.action.label}  (오늘 이미 함)`
          : `[Space] ${t.action.label}${t.action.score ? `  ${t.action.tier} +${t.action.score}` : ''}`;

    const where = this.custom ? '사진' : `${this.roomIndex + 1}/${MOCK_ROOMS.length}`;
    const lines = [
      `공간   ${this.meta.label}${this.mapId === 'room' ? `  (${where}${this.meta.fellBack ? ' FALLBACK' : ''})` : ''}   오늘 방문: ${[...(this.visited ?? [])].map((m) => MAPS[m].label).join(', ') || '없음'}`,
      `시간   DAY ${this.clock.day}  ${this.clock.label}  (기상 ${String(Math.floor(this.clock.wake / 60)).padStart(2, '0')}:${String(this.clock.wake % 60).padStart(2, '0')})${this.settling ? '  ★정산중' : ''}`,
      `점수   오늘 +${this.todayScore}  /  이 방 최대 ${max}      누적 ${this.total}`,
      `대상   ${prompt}`,
      this.lastAction ? `방금   ${this.lastAction}` : '',
      `상태   pos (${this.gx},${this.gy}) facing ${this.facing}   light ${(this.light ?? 0).toFixed(2)}${this.timeScale > 1 ? `   시간 ×${this.timeScale}` : ''}`,
      `수치   ${vitalsLine(this.vitals)}   (표시만 — 규칙 영향 없음)   어젯밤 ${this.sleptLastNight ? '잠' : '안 잠'}`,
      this.survey ? `설문   ${Object.entries(this.survey).map(([k, v]) => `${k}=${v}`).join('  ')}` : '',
      this.schedule
        ? `예약   ${this.schedule.items.map((i) => `${i.event.at}${i.played ? '✓' : ''}[${i.event.kind}]`).join('  ') || '없음'}`
        : (this.settlePromise ? '예약   정산 중…' : ''),
      // 화면(정산창)과 **같은 함수**가 만든 줄. 둘이 갈라지면 디버그가 거짓말을 한다
      devLine(this.table, {
        collapsed: this.collapsed, collapseNext: this.collapseNext,
        collapsedOn: this.collapsedOn, day: this.clock.day,
      }) + (this.settleUsage ? `   정산비용 in=${this.settleUsage.input} out=${this.settleUsage.output}` : ''),
      this.aiError ? `⚠ AI   ${this.aiError}` : '',
      this.settleError && this.settleError !== this.aiError ? `정산실패 ${this.settleError}` : '',
      this.world
        ? `세계   ${this.world.age}세 · ${this.world.situation}\n       압력: ${this.world.pressure}\n       인물: ${this.cast.map((c) => `${c.name}(${c.presence})`).join(', ')}\n       간극: ${this.gapNote ?? '—'}`
        : (this.survey ? '세계   캐스팅 중…' : ''),
      '',
      b.objects
        .filter((o) => !o.removed)
        .map((o) => {
          const a = actionFor(o);
          const mark = !a ? ' ' : this.done.has(a.key) ? '✓' : '·';
          return `${mark}${o.id}@(${o.x},${o.y})`;
        })
        .join('  '),
    ];
    el.textContent = lines.filter((l) => l !== '').join('\n');
  }
}
