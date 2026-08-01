// 파이프라인 4단계: buildRoom() 출력 → 화면 + 상호작용 + 하루.
// 매퍼가 준 collision 그리드를 그대로 이동 판정에 쓴다. 물리 엔진 없음.

import { validateVision, GRID_W, GRID_H } from '../room/schema.js';
import { buildRoom } from '../room/mapper.js';
import { MOCK_ROOMS } from '../room/mock.js';
import { MAPS, ROOM_EXIT, returnWall, GOAL_ID, registerGoalMap, clearGoalMap } from '../game/maps.js';
import { actionFor, potentialScore, promptLine, nameOf } from '../game/actions.js';
import { Clock, SLEEP_FROM, fmt } from '../game/clock.js';
import { Schedule } from '../game/schedule.js';
import { initialVitals, tickVitals, afterSleep, vitalsLine } from '../game/vitals.js';
import { Observer } from '../game/observer.js';
import { ambientLine, ambientOverrides } from '../game/ambient.js';
import { Overlay } from '../ui/overlay.js';
import { Dialogue } from '../ui/dialogue.js';
import { TILE, ROOM_TOP, buildBaseTextures, objectTexture, THEMES } from '../render/textures.js';

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

    this.loadRoom(0);

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
    this.input.keyboard.on('keydown-R', () => this.loadRoom((this.roomIndex + 1) % MOCK_ROOMS.length));
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

  /** 새 게임. 골 맵은 게임마다 새로 지어지고 붕괴도 풀린다. */
  resetEnding() {
    clearGoalMap();
    this.collapsed = false;
    this.collapseNext = false;
    this.mirrorTurn = 0;
    this.mirrorLog = [];
    this.goal = null;
    this.plan = null;
    this.table = { hypotheses: [], avoidance: { pattern: '', evidence: [] } };
  }

  get source() {
    return this.custom ?? MOCK_ROOMS[this.roomIndex];
  }

  /** 다음 날. 취침 시각이 내일 기상 시각을 정한다 (DESIGN.md §1). */
  nextDay() {
    this.overlay.hideSettlement();
    this.sleptLastNight = this.sleepMinutes !== null;   // 자정을 그냥 넘겼으면 안 잔 것
    if (this.sleptLastNight) this.vitals = afterSleep(this.vitals);
    this.clock.nextDay(this.sleepMinutes);
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
    this.metProps = new Set();      // 오늘 이미 다가간 무대
    this.propNames = new Map();     // 관측 키 → 이름
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
    if (this.collapseNext) { this.collapsed = true; this.collapseNext = false; }
    this.applySchedule();           // 정산이 이미 끝나 있으면 바로 예약

    this.overlay.drawHud(this.clock, this.todayScore, this.total);
    this.refresh();
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
    this.built = buildRoom(v.room);
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
    const slots = MAPS[this.mapId]?.slots ?? [];
    if (!slots.length) return;

    // 골 맵의 거울은 디렉터의 무대가 아니라 그 공간 자체에 속한다. 매일 바뀌지 않는다.
    const mirror = this.mapId === GOAL_ID ? MAPS[GOAL_ID].mirror : null;
    const scene = mirror
      ? { props: [{ ...mirror, slot: slots[0].id, isMirror: true }] }
      : this.sceneHere();
    if (!scene) return;

    for (const p of scene.props ?? []) {
      const slot = slots.find((s) => s.id === p.slot);
      if (!slot) continue;                                       // 없는 자리는 조용히 버린다
      if (this.built.collision[slot.y][slot.x] === 1) continue;   // 가구가 이미 있으면 포기

      const look = ['person', 'animal', 'object'].includes(p.look) ? p.look : 'object';
      const bottom = ROOM_TOP + (slot.y + 1) * TILE;
      const sprite = this.add.image(slot.x * TILE, bottom, `prop-${look}`)
        .setOrigin(0, 1).setDepth(bottom + 1);
      this.layer.add(sprite);

      this.built.collision[slot.y][slot.x] = 1;                  // 통과 불가 — 다가가야 만난다
      const key = `${this.mapId}:prop:${p.slot}`;
      this.propNames.set(key, p.name);                           // 관측 기록에 이름으로 남게
      this.props.push({ ...p, look, key, x: slot.x, y: slot.y, w: 1, h: 1, sprite,
        met: this.metProps.has(key) });
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
    this.observer.act(p.key, `${this.placeLabel()}의 ${p.name}`, this.clock.label, 'approach');
    this.metProps.add(p.key);
    p.met = true;

    if (p.isMirror) { this.talkToMirror(p); return; }   // 마지막 장면은 다른 AI가 맡는다

    // `detail`부터 한 자씩 띄운다. 다 읽을 때쯤 생성이 끝나 대기가 연출로 덮인다.
    // pending — 이 줄이 끝나도 닫지 않고 뒷말을 기다린다.
    this.dialogue.play(
      { lines: [{ speaker: p.name, text: p.detail || '…' }], choices: [] },
      () => {},
      { pending: true }
    );

    fetch('/api/agent/writer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: {
          kind: 'scene', at: this.clock.label, target: p.target ?? 'none',
          purpose: `무대 접촉 — ${p.signal ?? 'behavior'} 신호`,
          signal_wanted: [p.signal ?? 'behavior'],
          beat: p.opening || p.detail || p.name,
        },
        cast: this.cast,
        context: { day: this.clock.day, place: this.placeLabel(), avoidance: this.table?.avoidance?.pattern },
      }),
    })
      .then((r) => r.json())
      .then((out) => {
        if (out.error || !this.dialogue.open) throw new Error(out.error ?? 'closed');
        this.dialogue.continueWith(out.data);
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
      { pending: true }
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
  }

  recordPropTalk(p, script, choice) {
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
    this.refresh();
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
    const t = objectTexture(this, o.type, o.w, o.h, o.onWall, o.position, variant);
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
    if (this.clock.advance(delta * (this.timeScale ?? 1))) {   // 자정 = 하루 경계
      this.endDay('midnight');
      return;
    }
    this.vitals = tickVitals(this.vitals, this.clock.minutes - before);   // 표시용. 규칙엔 영향 없음
    this.overlay.drawHud(this.clock, this.todayScore, this.total);

    const due = this.schedule?.due(this.clock.minutes);
    if (due) {
      this.playEvent(due);
      return;
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
    return null;
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
      return {
        prop,
        obj: prop,
        action: prop.met ? null : { key: prop.key, verb: 'approach', label: prop.name, short: '다가가기', tier: null, score: 0 },
        done: prop.met,
        blocked: null,
      };
    }

    const ahead = this.objectAt(nx, ny);
    const obj = ahead ?? this.objectAt(this.gx, this.gy);
    if (!obj) return null;

    // 행동이 없는 사물도 반환한다 — 이름은 보여줘야 하므로
    const action = actionFor(obj);
    // 낮에는 잠이 오지 않는다. 없으면 기상 직후 취침 → 다음 날이 1시간짜리가 된다
    const tooEarly = action?.verb === 'sleep' && this.clock.minutes < SLEEP_FROM;
    return {
      obj, action,
      done: !!action && this.done.has(this.doneKey(action)),
      blocked: tooEarly ? `아직 잠이 안 온다 (${fmt(SLEEP_FROM)} 이후)` : null,
    };
  }

  interact() {
    const t = this.currentTarget();
    if (!t || !t.action || t.done || t.blocked) return;

    if (t.prop) {                   // 오늘의 무대에 다가간다
      this.approachProp(t.prop);
      return;
    }

    // 이동과 취침은 점수 행동이 아니다 — 하루 1회 규칙(done)에 넣지 않는다.
    // 문을 done에 넣으면 한 번 지나간 문이 그날 내내 잠긴다.
    if (t.action.verb === 'sleep') {
      this.endDay('sleep');
      return;
    }
    if (t.action.verb === 'go_out') {
      this.travel(t.obj);
      return;
    }
    if (t.action.verb === 'look') {
      this.lookAt(t.obj, t.action);
      return;
    }

    const o = t.obj;
    const cx = o.x * TILE + (o.w * TILE) / 2;
    const cy = (o.onWall && o.y === 0 ? ROOM_TOP + TILE : ROOM_TOP + (o.y + o.h) * TILE) - 6;

    const key = this.doneKey(t.action);
    this.observer.act(key, `${this.placeLabel()}의 ${nameOf(o)}`, this.clock.label, t.action.verb);
    this.done.add(key);
    const got = this.scoreFor(t.action.score);      // 붕괴 이후엔 0
    this.todayScore += got;
    this.total += got;
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
    this.overlay.drawHud(this.clock, this.todayScore, this.total);
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

    this.dialogue.play(item.script, (choice) => {
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
        if (out.error || this.clock.day !== 1) return;       // 늦게 왔으면 그냥 버린다
        this.plan = out.plan;
        this.pendingScripts = out.scripts ?? [];
        this.pendingAmbient = ambientOverrides(out.plan?.ambient);
        this.applySchedule();
        this.buildMap();                                     // 오늘의 프롭을 지금 세운다
        this.refresh();
      })
      .catch((e) => console.warn('[opening]', e.message));
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
      observed: this.observer.summary((k) => this.labelForKey(k)),
      history: this.history,
      cast: this.cast,
      places: this.placesForDirector(),
    };

    this.settlePromise = this.job('/api/settle', body)
      .then((out) => {
        if (out.error) throw new Error(out.error);
        this.table = out.analysis;
        this.plan = out.plan;
        this.pendingScripts = out.scripts ?? [];
        this.pendingAmbient = ambientOverrides(out.plan?.ambient);
        this.settleUsage = out.total;
        // 골 맵이 왔다 = 가설이 확인됐다. 골목 아래에 없던 문이 생긴다 (Act 3)
        if (out.goal && registerGoalMap(out.goal)) {
          this.goal = out.goal;
          console.log('[goal]', out.goal.label, '—', out.goal.reason);
        }
        this.applySchedule();          // 이미 다음 날이면 즉시 반영
        this.refresh();
        return out;
      })
      .catch((e) => {
        console.warn('[settle]', e.message);
        this.settleError = e.message;
        this.refresh();
        return null;
      });
  }

  /** 편성이 도착했고 새 날이 시작됐으면 예약을 건다. 둘 중 늦게 오는 쪽이 트리거. */
  applySchedule() {
    if (!this.pendingScripts || this.settling) return;
    this.schedule = new Schedule(this.pendingScripts, this.clock.wake);
    this.pendingScripts = null;
    if (this.pendingAmbient) { this.ambient = this.pendingAmbient; this.pendingAmbient = null; }
  }

  /** 하루 종료 = 침대 취침 OR 게임 내 자정. 먼저 오는 것 (DESIGN.md §1). */
  endDay(reason) {
    if (this.settling) return;
    this.settling = true;
    // 자정을 그냥 넘긴 것과 침대에서 잔 것은 다르다. null = 안 잤음
    this.sleepMinutes = reason === 'sleep' ? this.clock.minutes : null;
    this.clock.stop();

    this.cue.clear();
    this.label.setVisible(false);
    this.labelBox.setVisible(false);
    this.overlay.drawHud(this.clock, this.todayScore, this.total);   // 멈추기 전 마지막 값

    // 이력을 먼저 챙기고(오늘 재생된 이벤트) 정산을 쏜다
    if (this.schedule) this.history = [...this.history, ...this.schedule.toHistory(this.clock.day)].slice(-8);
    this.fireSettle();

    this.overlay.showSettlement({
      day: this.clock.day,
      reason,
      sleepMinutes: this.sleepMinutes,
      log: this.todayLog,
      todayScore: this.todayScore,
      total: this.total,
    });
    this.refresh();
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
      this.drawLabel(
        t.done ? `${t.prop.name}   ✓` : `${t.prop.name}   [Space] 다가가기`,
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
    const line = o.type === 'door' ? this.doorLine(o) : promptLine(o, t.done);
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
      : t.obj?.type === 'door'
        ? this.doorLine(t.obj)
      : !t.action
        ? `${promptLine(t.obj, false)}  (행동 없음)`
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
      this.table?.hypotheses?.length
        ? `가설   ${this.table.hypotheses.map((h) => `${h.desire}(${h.status} ${h.confidence})`).join('  ')}\n       Act ${this.table.act ?? 1}${this.settleUsage ? `   정산비용 in=${this.settleUsage.input} out=${this.settleUsage.output}` : ''}`
        : '',
      this.settleError ? `정산실패 ${this.settleError}` : '',
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
