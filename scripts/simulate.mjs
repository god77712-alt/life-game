// 며칠을 연속으로 돌려 가설이 confirmed에 도달하는지 본다.
//
// 핵심: **숨은 선호를 하나 심어놓고 AI가 찾아내는지** 확인한다.
// 시뮬레이션 플레이어는 자기가 무엇을 좋아하는지 말하지 않는다. 행동으로만 드러낸다.
// 디렉터가 무대를 짜고 → 플레이어가 반응하고 → analyst가 읽는 고리가 실제로 수렴하는가.
//
//   node scripts/simulate.mjs [일수]
//
// 실제 API를 쓴다. 하루 약 $0.16, 80초.

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAYERS, pullFor, opensUp } from './players.mjs';
import { disclosures } from '../src/game/listening.js';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const MAX_DAYS = Number(process.argv[2]) || 8;

// 어떤 사람으로 돌릴 것인가. `--player=b`로 대조군. 기본은 원본 a.
const PLAYER_ID = (process.argv.find((a) => a.startsWith('--player=')) ?? '').split('=')[1] || 'a';
const P = PLAYERS[PLAYER_ID];
if (!P) { console.error(`없는 플레이어: ${PLAYER_ID} (${Object.keys(PLAYERS).join(', ')})`); process.exit(1); }

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');
// a는 기존 경로를 그대로 쓴다 — 돌려놓은 6일을 이어서 돌릴 수 있어야 한다
const STATE = join(CACHE, PLAYER_ID === 'a' ? 'sim-state.json' : `sim-state-${PLAYER_ID}.json`);
const TRACE = join(CACHE, `sim-trace-${PLAYER_ID}.jsonl`);

// 하루가 끝날 때마다 저장한다. 호출 하나가 끊겨도 처음부터 다시 돌리지 않는다.
const saveState = async (s) => {
  await mkdir(dirname(STATE), { recursive: true });
  await writeFile(STATE, JSON.stringify(s, null, 1), 'utf8');
};
const loadState = async () => {
  try { return JSON.parse(await readFile(STATE, 'utf8')); } catch { return null; }
};

/**
 * 하루치 인과를 한 줄로 남긴다 — **무대 → 반응 → 판정 → 다음 무대**.
 * 상태 파일은 최신 것만 갖고 있어서 "이게 제대로 도는가"를 나중에 되짚을 수가 없다.
 * `scripts/audit.mjs`가 이 파일만 읽고 기계적으로 검사한다 (API 호출 없음).
 */
const trace = async (row) => {
  await mkdir(CACHE, { recursive: true });
  await appendFile(TRACE, `${JSON.stringify(row)}\n`, 'utf8');
};

// ── 심어놓은 진짜 선호 ─────────────────────────────────────
// 플레이어는 이걸 말하지 않는다. 행동으로만 드러난다. (scripts/players.mjs)
const LIKES = P.likes;

const world = {
  age: 24,
  situation: '졸업하고 1년. 이력서를 열어둔 채 닫지 않은 지 오래',
  season: '늦가을. 비가 잦다',
  pressure: '아무도 대놓고 묻지 않는다. 그게 더 신경 쓰인다',
  awake_window: '14:00~23:00. 새벽엔 자거나 누워 있다',
  outside_route: '편의점. 도보 4분. 사람 없는 시간대에만',
  channel: '엄마는 문 너머. 지훈의 카톡은 열려 있다',
};
const cast = [
  { name: '엄마', relation: '어머니, 같은 집', tone: '용건만. 대답을 기다리지 않는다', presence: '문 너머', pressure: '묻지 않음으로써 묻는다' },
  { name: '지훈', relation: '대학 동기', tone: '헐렁하다. 답장 없어도 또 보낸다', presence: '카톡', pressure: '자기 얘기를 할 뿐인데 그 안에 다 있다' },
];
const places = [
  { id: 'living', label: '거실', indoor: true, slots: ['a', 'b'] },
  { id: 'street', label: '골목', indoor: false, slots: ['a', 'b', 'c'] },
  { id: 'store', label: '편의점', indoor: false, slots: ['a', 'b', 'c'] },
  { id: 'park', label: '공원', indoor: false, slots: ['a', 'b', 'c', 'd'] },
];
const PLACE_LABEL = Object.fromEntries(places.map((p) => [p.id, p.label]));

const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
let seed = 20260731;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// 이 사람이 직접 칠 만한 말. 짧고, 묻는 쪽이고, 자기 얘기는 안 한다.
const pickTyped = () => P.typed[Math.floor(rnd() * P.typed.length)];

/** 이 플레이어가 프롭에 얼마나 끌리는가 */
const pull = (prop) => pullFor(P, prop, rnd);

/** 하루를 산다. 무대에 반응하고 기록을 남긴다. */
function playDay(day, plan) {
  const actions = [];
  const engaged = [];
  const passed = [];
  const unseen = [];
  const placesLog = [];
  const dialogue = [];
  let t = day === 1 ? 14 * 60 : 8 * 60;
  let score = 0;

  const add = (label, tier, s) => { actions.push({ label, tier, score: s }); score += s; };

  // 방 안 — 매일 비슷하다
  add('이불 개기', 'L0', 10);
  add('쓰레기 치우기', 'L1', 15);
  if (rnd() < 0.6) add('창문 열기', 'L1', 15);
  t += 120;
  placesLog.push({ place: '내 방', in: hhmm(day === 1 ? 840 : 480), out: hhmm(t), minutes: 120 });

  // 나가는 시각도 사람마다 다르다. 밤에만 나가는 사람 / 낮에 나가는 사람
  const goOut = t < P.outFrom ? (t = P.outFrom, true) : true;
  const visited = goOut ? ['거실', '골목'] : [];
  if (goOut) {
    for (const label of visited) add(`${label} 가기`, 'L2', 30);
  }

  // 무대 — 어디를 갈지는 무대가 정한다
  const scenes = plan?.scenes ?? [];
  const outdoor = scenes.filter((s) => s.place !== 'living');
  for (const s of outdoor) {
    const label = PLACE_LABEL[s.place] ?? s.place;
    if (!visited.includes(label)) {
      add(`${label} 가기`, 'L2', 30);
      visited.push(label);
    }
    const stay = { place: label, in: hhmm(t), minutes: 0 };
    for (const p of s.props ?? []) {
      const { approach, gaze } = pull(p);
      const g = Math.round(gaze * 10) / 10;
      if (rnd() < approach) {
        engaged.push({ what: `${label}의 ${p.name}`, place: label, at: hhmm(t), kind: 'approach', gazed_sec: g });
        dialogue.push({
          at: hhmm(t), speaker: p.name, text: p.detail,
          player: { choice: 'approach', text: '(다가갔다)' },
          for_prop: p.name, place: label, signal_wanted: [p.signal], watch: p.watch,
        });
        t += 8 + Math.round(g);
      } else {
        passed.push({ what: `${label}의 ${p.name}`, gazed_sec: g });
        t += 3;
      }
    }
    stay.out = hhmm(t);
    stay.minutes = 25 + Math.round(rnd() * 20);
    placesLog.push(stay);
  }
  // 가지 않은 공간의 무대는 본 적도 없다
  for (const s of scenes) {
    const label = PLACE_LABEL[s.place] ?? s.place;
    if (visited.includes(label)) continue;
    for (const p of s.props ?? []) unseen.push({ what: `${label}의 ${p.name}`, place: label });
  }

  // 찾아오는 것 — 지훈 것은 늦게라도 열고, 엄마 것은 잘 안 연다
  const notifications = [];
  const typed = [];      // 직접 친 문장 — 자기 개방 판정의 유일한 재료
  for (const [i, s] of (plan?.scripts ?? []).entries()) {
    const from = s.script?.lines?.[0]?.speaker ?? '알 수 없음';
    const at = s.event?.at ?? hhmm(600 + i * 200);
    const rate = P.openRate(from);
    const opens = rnd() < rate;
    const delay = rate < 0.5 ? 200 + rnd() * 300 : 30 + rnd() * 180;   // 안 여는 상대일수록 늦게 연다
    notifications.push({
      id: `n${day}_${i}`, from, at,
      opened_at: opens ? hhmm(toMin(at) + delay) : null,
      delay_min: opens ? Math.round(delay) : null,
    });
    if (!opens) continue;

    // 선택지는 끌리는 쪽으로. 아니면 흘린다.
    const cs = s.script?.choices ?? [];
    const liked = cs.find((c) => LIKES.test(`${c.text} ${c.reads_as}`));
    const dodge = cs.find((c) => /^\.{2,3}$/.test(c.text.trim())) ?? cs[1] ?? cs[0];
    const pick = liked ?? dodge;
    for (const l of s.script.lines ?? []) dialogue.push({ at, speaker: l.speaker, text: l.text });
    if (pick) {
      dialogue.push({
        at: hhmm(toMin(at) + delay),
        player: { choice: pick.id, text: pick.text, reads_as: pick.reads_as },
        for_event: s.event?.id, signal_wanted: s.event?.signal_wanted,
      });
    }

    // 끌리는 화제에서만 직접 쓴다. 이게 language 신호의 유일한 출처다 —
    // 선택지만 고르면 그 사람이 실제로 쓰는 말이 남지 않는다.
    const said = [...(s.script.lines ?? []).map((l) => l.text), pick?.text ?? ''].join(' ');
    if (liked && rnd() < 0.75) {
      // ★ 조건이 다 맞으면 **자기 얘기**를 한다. 아니면 묻기만 한다.
      //   상대가 맞고, 화제가 맞고, 약속 얘기가 안 붙었을 때만 (players.mjs의 opensUp).
      //   이게 이 게임의 최종 목표이고 AI가 알아내야 하는 정답이다.
      const open = opensUp(P, from, said) && rnd() < 0.6;
      const text = open ? P.discloseLines[Math.floor(rnd() * P.discloseLines.length)] : pickTyped();
      dialogue.push({
        at: hhmm(toMin(at) + delay + 1),
        player: { choice: null, text, typed: true },
        for_event: s.event?.id,
        to: from,
      });
      typed.push({ at: hhmm(toMin(at) + delay + 1), text, to: from });
    }
  }

  return {
    today: { score, actions },
    dialogue,
    observed: {
      places: placesLog, engaged, passed, unseen, notifications,
      // **이 게임의 최종 지표.** 코드가 표식으로 세고, 원문은 그대로 넘어간다
      told: disclosures(typed).lines,
      opened_up: disclosures(typed).count,
    },
  };
}

/** 작업이 끝날 때까지 물어본다. 4초 간격, 최장 10분. */
async function waitJob(id) {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const out = await getJson(`/api/job/${id}`);
    if (out.state === 'running') continue;
    if (out.state === 'done') return out;
    return { error: out.error ?? '작업 실패' };
  }
  return { error: '작업이 10분을 넘었다' };
}

function getJson(path) {
  const url = new URL(BASE + path);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET' }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(`응답 파싱 실패: ${raw.slice(0, 200)}`)); } });
    });
    req.on('error', reject);
    req.end();
  });
}

/** 타임아웃 없는 POST. 정산 한 번이 5분을 넘을 수 있다. */
function postJson(path, body) {
  const data = JSON.stringify(body);
  const url = new URL(BASE + path);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`응답 파싱 실패(${res.statusCode}): ${raw.slice(0, 200)}`)); }
      });
    });
    req.setTimeout(0);
    req.on('error', reject);
    req.end(data);
  });
}

const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// ── 루프 ──────────────────────────────────────────────────

const resumed = process.argv.includes('--fresh') ? null : await loadState();
let table = resumed?.table ?? { hypotheses: [], avoidance: { pattern: '', evidence: [] } };
let history = resumed?.history ?? [];
let plan = resumed?.plan ?? null;
let total = resumed?.total ?? 0;
let startDay = (resumed?.day ?? 0) + 1;
seed = resumed?.seed ?? seed;
const cost = { input: 0, output: 0, ms: 0 };

console.log(`플레이어 ${PLAYER_ID} — 숨은 선호: ${P.label}`);
console.log(resumed ? `DAY ${startDay}부터 이어서 (누적 ${total})` : '처음부터');
console.log(`${'='.repeat(72)}`);

for (let day = startDay; day <= MAX_DAYS; day++) {
  const staged = plan;                 // 어제 디렉터가 오늘을 위해 깔아둔 무대
  const lived = playDay(day, plan);
  total += lived.today.score;

  // 서버가 id만 즉시 주고 백그라운드로 돈다. 결과가 나올 때까지 물어본다.
  const started = await postJson('/api/settle', { day, world, table, ...lived, history, cast, places, plan });
  const out = started.job ? await waitJob(started.job) : started;
  if (out.error) {
    console.error(`DAY ${day} 실패: ${out.error}`);
    console.error(`  → 다음 실행은 DAY ${day}부터 이어서 시작한다 (상태 저장됨)`);
    break;
  }

  table = out.analysis;
  // 편성이 실패해도 판정은 왔다. 무대만 어제 것을 그대로 쓴다 — 하루를 버리지 않는다.
  if (out.degraded) console.warn(`  ⚠ ${out.degraded} — 어제 무대를 그대로 쓴다`);
  else plan = { ...out.plan, scripts: out.scripts };
  history = [...history, ...(out.plan?.events ?? []).map((e) => ({ day, kind: e.kind, beat: e.beat }))].slice(-8);
  await saveState({ day, table, history, plan, total, seed });

  // 하루치 인과를 통째로 남긴다. 이게 있어야 나중에 "적응했는가"를 코드로 물을 수 있다.
  await trace({
    day,
    player: PLAYER_ID,
    staged: (staged?.scenes ?? []).flatMap((s) =>
      (s.props ?? []).map((p) => ({ place: s.place, name: p.name, look: p.look, signal: p.signal, target: p.target }))),
    engaged: lived.observed.engaged.map((e) => ({ what: e.what, sec: e.gazed_sec })),
    passed: lived.observed.passed.map((p) => ({ what: p.what, sec: p.gazed_sec })),
    unseen: lived.observed.unseen.map((u) => u.what),
    typed: lived.dialogue.filter((d) => d.player?.typed).map((d) => d.player.text),
    notifications: lived.observed.notifications.map((n) => ({ from: n.from, delay_min: n.delay_min })),
    opened_up: lived.observed.opened_up ?? 0,
    told: (lived.observed.told ?? []).filter((t) => t.self).map((t) => ({ text: t.text, to: t.to })),
    hypotheses: (table.hypotheses ?? []).map((h) => ({
      id: h.id, label: h.label ?? h.desire, who: h.who ?? 'none', statement: h.statement, status: h.status,
      confidence: h.confidence, verified: h.verified_count,
      kinds: [...new Set((h.signals ?? []).map((s) => s.kind))], missing: h.missing ?? [],
    })),
    verdicts: (out.analysis.verdicts ?? []).map((v) => ({ id: v.id, verdict: v.verdict, evidence: v.evidence })),
    avoidance: table.avoidance?.pattern ?? '',
    pacing: out.plan?.pacing,
    reasoning: out.plan?.reasoning,
    next: (out.plan?.scenes ?? []).flatMap((s) =>
      (s.props ?? []).map((p) => ({ place: s.place, name: p.name, look: p.look, signal: p.signal, target: p.target }))),
  });
  cost.input += out.total.input;
  cost.output += out.total.output;
  cost.ms += out.usage.reduce((s, u) => s + u.ms, 0);

  console.log(`\nDAY ${day}   오늘 +${lived.today.score}  누적 ${total}   Act ${table.act}`);
  console.log(`  다가감: ${lived.observed.engaged.map((e) => e.what.replace(/^.*의 /, '')).join(', ') || '없음'}`);
  console.log(`  지나침: ${lived.observed.passed.map((p) => `${p.what.replace(/^.*의 /, '')}(${p.gazed_sec}s)`).join(', ') || '없음'}`);
  const typed = lived.dialogue.filter((d) => d.player?.typed).map((d) => `"${d.player.text}"`);
  if (typed.length) console.log(`  직접 씀: ${typed.join(' ')}`);
  for (const h of table.hypotheses) {
    const kinds = [...new Set((h.signals ?? []).map((s) => s.kind))].join('/');
    console.log(`  [${h.status}] ${h.label ?? h.desire ?? h.id}  conf=${h.confidence} 검증=${h.verified_count} 신호=${kinds || '없음'}`);
    console.log(`             누구=${h.who ?? 'none'}  매개=${h.through ?? 'none'}  언제=${h.when ?? '-'}`);
    if (h.missing?.length) console.log(`             부족: ${h.missing.join(' · ')}`);
  }
  // 판정 결과 — 어제 예측이 맞았는가. 이게 confidence를 움직이는 유일한 입력이다
  for (const v of out.analysis.verdicts ?? []) {
    const mark = v.verdict === 'supported' ? '↑' : v.verdict === 'contradicted' ? '↓' : '·';
    console.log(`  판정 ${mark} ${v.id} ${v.verdict}`);
    console.log(`         근거: ${v.evidence}`);
    console.log(`         ${v.note}`);
  }
  console.log(`  회피: ${table.avoidance?.pattern ?? ''}`);
  console.log(`  내일 무대: ${(out.plan?.scenes ?? []).map((s) => `${PLACE_LABEL[s.place] ?? s.place}(${s.props?.length ?? 0})`).join(' ') || '없음'}`);

  if (table.confirmed) {
    console.log(`\n${'★'.repeat(36)}`);
    console.log(`DAY ${day} — confirmed: ${table.confirmed.desire}`);
    console.log(`  ${table.confirmed.statement}`);
    console.log(`  confidence ${table.confirmed.confidence} / 검증 ${table.confirmed.verified_count}회 / 신호 3겹`);
    console.log(`${'★'.repeat(36)}`);
    break;
  }
}

console.log(`\n${'='.repeat(72)}`);
console.log(`합계  in=${cost.input} out=${cost.output}  $${((cost.input * 5 + cost.output * 25) / 1e6).toFixed(3)}  ${Math.round(cost.ms / 1000)}초`);
