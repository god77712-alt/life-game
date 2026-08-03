// 게임 정적 파일 + Claude API 프록시를 한 서버에서. 오리진이 하나라 CORS가 없고,
// 배포도 이 프로세스 하나만 띄우면 된다 (심사위원 링크 접근성 — CLAUDE.md).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { hasKey, verifyKey, keyShape, roomVision, checkReality, runAgent, agentList, AGENTS, MODEL } from './agents.mjs';
import { applyStatus, missing, applyVerdicts, mergeAnalysis, CONFIRM } from './hypothesis.mjs';
import { clearPromptCache } from './prompts.mjs';
import { stats as cacheStats } from './cache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const MAX_BODY = 12 * 1024 * 1024;   // 사진 한 장

try {
  process.loadEnvFile(join(ROOT, '.env'));   // 없으면 그냥 넘어간다
} catch {
  /* .env 없음 — 환경변수로 넣었을 수 있으므로 계속 */
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('본문이 너무 크다'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function handleRoomVision(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.code === 'TOO_LARGE' ? 413 : 400, { error: e.message });
  }

  const { image, mediaType } = body ?? {};
  if (typeof image !== 'string' || !image) return json(res, 400, { error: 'image(base64)가 없다' });
  if (!ALLOWED_MEDIA.has(mediaType)) return json(res, 400, { error: `지원하지 않는 mediaType: ${mediaType}` });

  const t0 = Date.now();
  try {
    // 사진은 이 스코프 밖으로 나가지 않는다. 디스크에 쓰지 않고 로그에도 남기지 않는다.
    const { vision, usage } = await roomVision(image, mediaType);
    console.log(`[vision] ok ${Date.now() - t0}ms  in=${usage.input} out=${usage.output}  objects=${vision.objects?.length}`);
    return json(res, 200, { vision, usage });
  } catch (err) {
    console.error(`[vision] fail ${Date.now() - t0}ms  ${err.code ?? ''} ${err.message}`);
    const code = err.code === 'NO_KEY' ? 503 : err.code === 'REFUSAL' ? 422 : 502;
    // 클라이언트는 실패해도 기본 레이아웃으로 폴백한다 (room-vision.md 리스크 표)
    return json(res, code, { error: err.message, code: err.code ?? 'UPSTREAM' });
  }
}

/**
 * Act 4 — 현실 인증. **이 게임에서 점수가 붙는 마지막 요청이다.**
 *
 * 방 사진과 똑같이 사진은 이 스코프 밖으로 나가지 않는다.
 * 실패해도 감점은 없다 — 통과가 아니면 그냥 +0이고 다시 찍을 수 있다.
 */
async function handleReality(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.code === 'TOO_LARGE' ? 413 : 400, { error: e.message });
  }

  const { image, mediaType, claim = '이불 개기' } = body ?? {};
  if (typeof image !== 'string' || !image) return json(res, 400, { error: 'image(base64)가 없다' });
  if (!ALLOWED_MEDIA.has(mediaType)) return json(res, 400, { error: `지원하지 않는 mediaType: ${mediaType}` });

  const t0 = Date.now();
  try {
    const { verdict, usage } = await checkReality(image, mediaType, claim);
    // 사진 내용은 로그에 남기지 않는다. 통과 여부만
    console.log(`[reality] ${verdict.passed ? '통과' : verdict.reason} ${Date.now() - t0}ms`);
    return json(res, 200, { verdict, usage });
  } catch (err) {
    console.error(`[reality] fail ${Date.now() - t0}ms  ${err.code ?? ''} ${err.message}`);
    return json(res, err.code === 'NO_KEY' ? 503 : 502, { error: err.message, code: err.code ?? 'UPSTREAM' });
  }
}

/** AI 하나를 직접 호출한다. 프롬프트 튜닝·디버그용. */
async function handleAgent(req, res, name) {
  if (!AGENTS[name]) return json(res, 404, { error: `없는 AI: ${name}`, agents: Object.keys(AGENTS) });

  let vars;
  try {
    vars = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.code === 'TOO_LARGE' ? 413 : 400, { error: e.message });
  }

  try {
    const { data, usage } = await runAgent(name, vars);
    console.log(`[${name}] ok ${usage.ms}ms  in=${usage.input} out=${usage.output}`);
    return json(res, 200, { data, usage });
  } catch (err) {
    console.error(`[${name}] fail  ${err.code ?? ''} ${err.message}`);
    return json(res, err.code === 'NO_KEY' ? 503 : 502, { error: err.message, code: err.code ?? 'UPSTREAM' });
  }
}

// ── 오래 도는 작업 ─────────────────────────────────────────
//
// 정산은 AI를 4~7개 돌려 95초~5분이 걸린다. 그걸 HTTP 요청 하나로 붙들고 있으면
// **어느 호스트에 올려도 중간 프록시가 먼저 끊는다** (보통 100~120초).
// 그래서 접수하고 id만 돌려준 뒤, 클라이언트가 물어보게 한다.
//
// 게임은 원래 정산을 기다리지 않으므로(첫 이벤트는 몇 분 뒤다) 체감은 그대로다.

const JOBS = new Map();
const JOB_TTL = 30 * 60 * 1000;      // 30분. 하루가 그보다 길 수는 없다

function startJob(work) {
  const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, state: 'running', at: Date.now() };
  JOBS.set(id, job);

  work()
    .then((result) => Object.assign(job, { state: 'done', result }))
    .catch((err) => Object.assign(job, { state: 'failed', error: err.message, code: err.code ?? 'UPSTREAM' }));

  // 오래된 것은 치운다. 서버가 며칠 떠 있어도 메모리가 안 샌다
  for (const [k, j] of JOBS) if (Date.now() - j.at > JOB_TTL) JOBS.delete(k);
  return id;
}

function handleJob(res, id) {
  const job = JOBS.get(id);
  if (!job) return json(res, 404, { error: '없는 작업이거나 만료됐다', state: 'gone' });
  if (job.state === 'running') return json(res, 202, { state: 'running' });

  JOBS.delete(id);                   // 한 번 가져가면 끝. 다시 물어볼 일이 없다
  return job.state === 'done'
    ? json(res, 200, { state: 'done', ...job.result })
    : json(res, 200, { state: 'failed', error: job.error, code: job.code });
}

/**
 * 어제 세운 예측을 뽑아낸다 — 무대의 프롭과 편성 이벤트 양쪽.
 *
 * `watch`는 디렉터가 **어제 미리** 쓴 관찰 기준이다. 이게 있어야 사후에 기준을 바꾸지 않고
 * 채점할 수 있다. 사전 등록 없이 결과만 보고 해석하면 그건 판정이 아니라 이야기다.
 */
function predictionsOf(plan) {
  const out = [];
  for (const s of plan?.scenes ?? []) {
    for (const p of s.props ?? []) {
      out.push({ place: s.place, name: p.name, target: p.target, signal: p.signal, watch: p.watch });
    }
  }
  for (const e of plan?.events ?? []) {
    out.push({ kind: e.kind, target: e.target, watch: e.purpose, beat: e.beat });
  }
  return out;
}

/**
 * 정산 — 하루가 끝날 때 도는 파이프라인.
 *
 *   referee(채점) ┐
 *                 ├→ 코드가 병합·confidence 이동·status → director(편성) → writer ×N
 *   analyst(가설) ┘
 *
 * **채점과 분석은 서로의 출력을 보지 않는다.**
 * 세우는 쪽과 채점하는 쪽을 나누지 않으면 자기 숙제를 자기가 채점하게 되고,
 * 그러면 confidence는 오르기만 한다. 독립적이어야 채점이 채점으로 남는다.
 * 병렬로 도는 건 덤이다 — 직렬이면 호출 3개가 이어져 5분 타임아웃에 걸린다.
 */
async function runSettle(body) {
  const {
    day = 1, world = null, table = {}, today = {}, plan = null,
    dialogue = [], history = [], cast = [], places = [], observed = null,
    errands = [],   // 어제 부탁한 것들 — **안 한 것이 여기 남는다**
    bonds = [],     // 인물별 호감도 + 그 사람에게 한 자기 얘기 원문
  } = body ?? {};
  const usage = [];
  const t0 = Date.now();

  // 1) 채점과 분석을 **동시에** 돌린다.
  //
  //    analyst는 더 이상 점수를 안 매기므로 referee의 결과를 볼 이유가 없다.
  //    서로의 출력을 못 보는 게 오히려 맞다 — 독립적이어야 채점이 채점으로 남는다.
  //    직렬로 두면 정산 한 번에 호출 3개가 줄줄이 이어져 5분 타임아웃에 걸린다(실제로 걸렸다).
  const live = (table.hypotheses ?? []).filter((h) => !h.dropped);
  const predictions = predictionsOf(plan);

  const refereeCall = live.length && predictions.length
    ? runAgent('referee', {
      day,
      predictions,
      observed,
      dialogue,
      // statement와 who만 준다. confidence를 보여주면 마저 올려주고 싶어진다.
      // who가 있어야 "예측한 그 사람에게 열렸는가"를 판정할 수 있다
      hypotheses: live.map((h) => ({ id: h.id, who: h.who, statement: h.statement })),
    }).catch((err) => {
      // 채점이 실패해도 하루를 버리지 않는다. 점수가 그대로일 뿐이다
      console.warn(`[settle] day${day} 채점 실패 — 점수 유지: ${err.message}`);
      return null;
    })
    : Promise.resolve(null);

  const analystCall = runAgent('analyst', { day, table, today, dialogue, observed });

  let analysis;
  let withMissing;
  let a;
  try {
    const [j, an] = await Promise.all([refereeCall, analystCall]);
    a = an;
    usage.push(a.usage);

    let verdicts = [];
    let judged = table.hypotheses ?? [];
    if (j) {
      usage.push(j.usage);
      verdicts = j.data.verdicts ?? [];
      judged = applyVerdicts(judged, verdicts, day);       // 이동폭은 MOVE 상수
    }

    // 점수는 analyst가 뭐라 하든 채점 결과를 쓴다. 문턱 판정도 코드가 한다
    // told(직접 친 문장)를 넘긴다 — 자기 개방이 실제로 있었는지가 confirmed의 조건이다
    analysis = applyStatus(
      { ...a.data, hypotheses: mergeAnalysis(judged, a.data.hypotheses) },
      observed?.told ?? [],
    );
    withMissing = {
      ...analysis,
      verdicts,
      hypotheses: analysis.hypotheses.map((h) => ({ ...h, missing: missing(h) })),
      // **문턱을 화면이 다시 적지 않게 같이 보낸다.** 클라이언트가 2회·3겹을 하드코딩하면
      // hypothesis.mjs와 갈라지고, 그 순간 화면이 거짓말을 시작한다
      confirm: CONFIRM,
    };
  } catch (err) {
    console.error(`[settle] day${day} 분석 실패 ${Date.now() - t0}ms  ${err.code ?? ''} ${err.message}`);
    throw err;      // 분석이 없으면 하루가 없다. 작업 자체가 실패다
  }

  // 1.5) 가설이 확인됐다 → **골 맵.** 게임당 1회, 여기서만.
  //
  //      플레이어가 직접 친 말 원문을 그대로 넘긴다. 요약하면 말투가 사라지고,
  //      말투가 사라지면 거울이 그 사람을 닮지 않는다 (CLAUDE.md — 원문 보관이 유일한 자산).
  let goal = null;
  if (analysis.confirmed && !body.hasGoal) {
    try {
      // ★ 자기 얘기만 따로. **무엇을 지을지가 여기서 나온다** —
      //   `self`는 listening.js가 표식으로 센 값이고, 모델이 판단한 게 아니다.
      const told = observed?.told ?? [];
      const disclosed = told
        .filter((t) => t.self)
        .map((t) => ({ text: t.text, to: t.to ?? null, at: t.at ?? null }));

      const g = await runAgent('goal-map', {
        // 없으면 없다고 말한다. 있는 척하면 모델이 사연을 지어낸다
        disclosed: disclosed.length ? disclosed : '(자기 얘기가 한 줄도 없다 — 재료가 얇다)',
        confirmed: analysis.confirmed,
        avoidance: analysis.avoidance,
        world,
        typed: told.map((t) => t.text).filter(Boolean),
      });
      usage.push(g.usage);
      goal = g.data;
      console.log(`[settle] day${day} 골 맵 생성 — ${goal.label}`);
    } catch (err) {
      // 골 맵이 없어도 하루는 끝난다. 다음 정산에서 다시 시도된다
      console.error(`[settle] day${day} 골 맵 실패: ${err.message}`);
    }
  }

  // 2) 편성 — 실패해도 **판정은 버리지 않는다.**
  //    무대는 다시 짜면 되지만 그날의 판정(특히 confirmed)은 그날의 기록에서만 나온다.
  //    한 번 편성 절단 때문에 confirmed 하루를 통째로 잃은 적이 있다.
  try {
    const d = await runAgent('director', {
      day, world, table: withMissing, analysis: a.data.note, history, places, cast, bonds,
      // 어제 뭘 부탁했고 뭘 안 했는지. 같은 걸 또 시킬지 말지는 디렉터가 정한다
      errands,
    });
    usage.push(d.usage);

    const scripts = await Promise.all(
      (d.data.events ?? []).map(async (event) => {
        const w = await runAgent('writer', {
          event, cast, context: { day, avoidance: analysis.avoidance?.pattern },
        });
        usage.push(w.usage);
        return { event, script: w.data };
      })
    );

    const total = usage.reduce((s, u) => ({ input: s.input + u.input, output: s.output + u.output }), { input: 0, output: 0 });
    console.log(`[settle] day${day} ok ${Date.now() - t0}ms  calls=${usage.length}  in=${total.input} out=${total.output}`);

    return { analysis: withMissing, plan: d.data, scripts, goal, usage, total };
  } catch (err) {
    const total = usage.reduce((s, u) => ({ input: s.input + u.input, output: s.output + u.output }), { input: 0, output: 0 });
    console.error(`[settle] day${day} 편성 실패 — 분석은 살린다  ${err.code ?? ''} ${err.message}`);
    return {
      analysis: withMissing, plan: null, scripts: [], goal,
      degraded: `편성 실패: ${err.message}`, usage, total,
    };
  }
}

/**
 * 개막 편성 — **DAY 1을 위한 무대.**
 *
 * 정산은 하루가 끝나야 도니까 DAY 1은 구조적으로 프롭 0 / 이벤트 0이었다.
 * 첫인상이 빈 방인 게임을 만들 수는 없다. 그래서 분석 없이 편성만 한 번 돌린다.
 * 아직 아무것도 모르는 상태이므로 디렉터가 하는 일은 **탐색** — 넓게 던져보는 것이다.
 */
async function runOpening(body) {
  const { world = null, cast = [], places = [] } = body ?? {};
  const usage = [];
  const t0 = Date.now();

  try {
    const d = await runAgent('director', {
      day: 1,
      world,
      cast,
      errands: [],
      bonds: [],
      table: { hypotheses: [], avoidance: { pattern: '(아직 없음)', evidence: [] } },
      // "탐색이다"라고만 쓰면 조심스럽게 굴다가 이벤트를 0건 낸다 (실제로 그랬다).
      // 첫날은 밀도가 곧 첫인상이므로 개수를 못박는다.
      analysis: '첫날이다. 가설이 하나도 없으니 목적은 검증이 아니라 **탐색**이다 — '
        + '무엇에 눈이 가고 무엇을 지나치는지 보려면 성격이 다른 자극을 넓게 깔아야 한다. '
        + '아직 아무것도 모르는 상태라고 해서 조심스럽게 굴지 마라. 오늘 아무 일도 안 일어나면 '
        + '관측이 0이고, 그러면 내일 세울 가설도 없다.\n'
        + '**반드시 지킬 것: 무대는 서로 다른 공간 3곳, 이벤트는 4건.** '
        + '이벤트 4건은 awake_window 전체에 고르게 흩어라 — 앞의 두어 시간이 비면 그게 첫인상이 된다. '
        + '사람·사물·동물·날씨를 섞어라. 무엇에 반응하는지 모르니 한 종류로 몰면 안 된다.\n'
        // 첫날에 이 둘을 비워 보내는 일이 실제로 있었다. 스키마에 있다고 채우는 게 아니다 —
        // 시켜야 채운다. cast_state가 비면 인물의 처지가 아예 시작되지 않고,
        // 그러면 "사흘째"라는 문장을 만들 시작점이 없다
        + '**cast_state는 등장인물 전원을 채워라.** 첫날이라 아무 일도 안 일어난 게 아니다 — '
        + '사람은 이미 각자의 처지 속에 있고, 플레이어는 그 한가운데로 들어온다. '
        + 'since는 전부 1로 두되 상황은 어제부터 이어져 온 것처럼 써라.\n'
        + '**errands는 0~1건.** 첫날부터 여럿이 부탁하면 심부름 목록이 된다. '
        + '있다면 가장 가까운 사람 하나가, 안 해도 그만인 것으로.',
      history: [],
      places,
    });
    usage.push(d.usage);

    const scripts = await Promise.all(
      (d.data.events ?? []).map(async (event) => {
        const w = await runAgent('writer', { event, cast, context: { day: 1, avoidance: null } });
        usage.push(w.usage);
        return { event, script: w.data };
      })
    );

    const total = usage.reduce((s, u) => ({ input: s.input + u.input, output: s.output + u.output }), { input: 0, output: 0 });
    console.log(`[opening] ok ${Date.now() - t0}ms  calls=${usage.length}  in=${total.input} out=${total.output}`);
    return { plan: d.data, scripts, usage, total };
  } catch (err) {
    // 개막 무대가 없어도 게임은 돈다 — 방과 관찰 대상은 이미 있다
    console.error(`[opening] fail ${Date.now() - t0}ms  ${err.code ?? ''} ${err.message}`);
    throw err;
  }
}

/** 오래 도는 작업을 접수한다. 즉시 id를 돌려주고, 클라이언트가 /api/job/:id로 물어본다. */
async function accept(req, res, run) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.code === 'TOO_LARGE' ? 413 : 400, { error: e.message });
  }
  return json(res, 202, { job: startJob(() => run(body)) });
}

async function serveStatic(req, res, url) {
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return json(res, 403, { error: 'forbidden' });

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 ${rel}`);
  }
}

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  // 깨워두기용. **무료 플랜은 15분 놀면 잠들고, 깨우는 데 50초가 걸린다** —
  // 심사위원이 링크를 눌렀을 때 그 50초를 만나면 그걸로 끝이다.
  // 외부 크론이 10분마다 여기를 친다. health와 달리 디스크를 읽지 않는다.
  if (url === '/api/ping') {
    return json(res, 200, { ok: true, build: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7) });
  }

  if (url === '/api/health') {
    // build — 배포본이 어느 커밋인지. 이게 없으면 "고쳤는데 안 된다"가 코드 문제인지
    // 배포가 아직 안 온 건지 구분할 방법이 없다 (실제로 한참 헤맸다).
    // Render가 넣어주는 값이고, 로컬에서는 'dev'.
    // key — **값이 있는지가 아니라 실제로 되는지.** 값이 들어 있는 채로 401을 받으면
    // 게임은 아무 말 없이 이벤트가 0건이 된다. 나흘 동안 그랬다 (agents.mjs verifyKey)
    const k = await verifyKey();
    return json(res, 200, {
      build: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
      key: k.ok, keyPresent: hasKey(), keyError: k.error,
      // 키 자체는 절대 안 내보낸다. **모양만** 내보낸다 —
      // 붙여넣다 잘렸는지·공백이 붙었는지를 이걸로 바로 안다.
      // 값이 아니므로 공개돼도 잃을 게 없고, 없으면 대시보드를 눈으로 뒤져야 한다
      keyShape: keyShape(),
      model: MODEL, agents: agentList(), cache: await cacheStats(),
    });
  }
  if (url === '/api/room-vision' && req.method === 'POST') {
    return handleRoomVision(req, res);
  }
  if (url === '/api/reality' && req.method === 'POST') {
    return handleReality(req, res);
  }
  if (url.startsWith('/api/agent/') && req.method === 'POST') {
    return handleAgent(req, res, url.slice('/api/agent/'.length));
  }
  if (url === '/api/settle' && req.method === 'POST') {
    return accept(req, res, runSettle);
  }
  if (url === '/api/opening' && req.method === 'POST') {
    return accept(req, res, runOpening);
  }
  if (url.startsWith('/api/job/')) {
    return handleJob(res, url.slice('/api/job/'.length));
  }
  if (url === '/api/reload-prompts') {          // 개발용 — 프롬프트 md만 고치고 반영
    clearPromptCache();
    return json(res, 200, { ok: true });
  }
  if (url.startsWith('/api/')) {
    return json(res, 404, { error: `없는 엔드포인트: ${url}` });
  }
  return serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(hasKey()
    ? `Claude API 키: 있음 (${MODEL})`
    : 'Claude API 키: 없음 — 목 데이터로만 동작. .env에 ANTHROPIC_API_KEY를 넣을 것');
});
