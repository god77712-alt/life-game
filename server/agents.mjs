// AI 레지스트리. 역할이 다른 AI를 하나씩 등록하고 공통 실행기로 굴린다.
//
// 왜 나누는가 — 분석과 생성은 요구가 정반대다.
//   분석(analyst/director) : 스키마 고정, 창의성 불필요, 일관성이 전부
//   생성(writer/npc)       : 스키마 최소, 캐릭터 톤 유지, 매번 달라야 함
// 하나로 합치면 JSON을 강제하는 순간 대사가 딱딱해지고, 대사에 집중하면 스키마가 흔들린다.
//
// 새 AI 추가 = prompts/<name>.md 쓰기 + 아래 AGENTS에 한 줄. 그게 전부다.

import Anthropic from '@anthropic-ai/sdk';
import { TYPES, WALL_POSITIONS, FLOOR_POSITIONS, SIZES } from '../src/room/schema.js';
import { THEME_LIST as THEME_NAMES } from '../src/render/textures.js';
import { loadPrompt } from './prompts.mjs';
import * as cache from './cache.mjs';

export const MODEL = 'claude-opus-5';

let client = null;
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function getClient() {
  if (!hasKey()) {
    const e = new Error('ANTHROPIC_API_KEY가 없다. .env에 넣고 서버를 다시 시작할 것');
    e.code = 'NO_KEY';
    throw e;
  }
  // 정산은 호출 4건이 줄줄이 이어진다. 하나가 끊기면 하루치가 통째로 날아가므로 넉넉히.
  client ??= new Anthropic({ maxRetries: 4, timeout: 10 * 60 * 1000 });
  return client;
}

// ── 키가 **진짜** 되는가 ─────────────────────────────────────
//
// `hasKey()`는 환경변수가 있는지만 본다. 그런데 배포본에 값이 들어 있으면서
// 401을 받는 일이 실제로 있었다 — 그 상태로 나흘을 플레이했고, 그동안
// 1일차 무대도 매일 밤 정산도 전부 조용히 실패했다. **있다는 것과 된다는 것은 다르다.**
// (8/1에 "밀었다는 것과 떠 있다는 것은 다르다"로 한 번 겪은 것과 같은 모양이다.)
//
// 그래서 health는 값의 유무가 아니라 한 번 찔러본 결과를 말한다.
// 제일 싼 모델로 1토큰. 되면 10분, 안 되면 30초 캐시 — 고치고 나서 오래 안 기다리게.

const KEY_TTL = { ok: 10 * 60 * 1000, bad: 30 * 1000 };
const PROBE_MODEL = 'claude-haiku-4-5-20251001';
let keyCheck = null;

export async function verifyKey() {
  if (!hasKey()) return { ok: false, error: 'ANTHROPIC_API_KEY가 없다' };
  if (keyCheck && Date.now() - keyCheck.at < KEY_TTL[keyCheck.ok ? 'ok' : 'bad']) return keyCheck;

  try {
    await getClient().messages.create({
      model: PROBE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: '.' }],
    });
    keyCheck = { at: Date.now(), ok: true, error: null };
  } catch (err) {
    // 키 자체가 틀린 것과 잠깐 못 붙는 것을 구분해서 적는다
    const status = err.status ?? err.code ?? '';
    keyCheck = { at: Date.now(), ok: false, error: `${status} ${err.message ?? err}`.trim().slice(0, 200) };
  }
  return keyCheck;
}

// ── 스키마 ──────────────────────────────────────────────────

const str = (enumList) => (enumList ? { type: 'string', enum: enumList } : { type: 'string' });
const obj = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const arr = (items) => ({ type: 'array', items });

// 비전 — src/room/schema.js의 enum을 재사용해 클라이언트 검증과 어긋날 수 없게
const ROOM_SCHEMA = obj({
  room_shape: str(['rect', 'l_shape']),
  objects: arr(obj({
    type: str([...TYPES]),
    position: str([...WALL_POSITIONS, ...FLOOR_POSITIONS]),
    size: str([...SIZES]),
    cleanable: { type: 'boolean' },
  })),
  messiness: { type: 'number' },
});

const SIGNAL = obj({
  day: { type: 'integer' },
  kind: str(['language', 'reaction', 'behavior']),
  evidence: str(),          // 원문 인용 또는 관측된 행동
  reading: str(),           // 그것을 어떻게 읽었는가
});

/**
 * 분석 — 가설 테이블. status는 코드가 정한다(hypothesis.mjs). 모델은 근거만 낸다.
 *
 * **가설의 형태가 바뀌었다.** 예전에는 (무엇에 끌리는가) 하나였고,
 * 그래서 '고양이에게 밥 주기' 같은 혼자 하는 일이 confirmed를 가져갔다.
 * 이 게임의 목표는 취향을 알아내는 게 아니라 **이 사람이 누군가에게 자기 얘기를 하는 것**이다.
 * 그러니 가설은 취향이 아니라 **입이 열리는 조건**이어야 한다 — 누구에게, 무엇을 매개로, 언제.
 */
const ANALYSIS_SCHEMA = obj({
  hypotheses: arr(obj({
    id: str(),
    label: str(),               // 짧은 이름. '지훈 · 고양이 화제 · 약속 없을 때'
    who: str(),                 // ★ 누구에게 열리는가. cast의 이름, 아직 모르면 'none'
    through: str(),             // 무엇을 매개로 (화제·사물·동물). 없으면 'none'
    when: str(),                // 어떤 상황·시간에
    statement: str(),           // 위 셋을 합친 **검증 가능한** 한 문장
    // confidence·verified_count는 여기 없다 — referee 판정에 따라 코드가 움직인다
    signals: arr(SIGNAL),
    dropped: { type: 'boolean' },
  })),
  avoidance: obj({
    pattern: str(),             // 회피 패턴 한 문장
    evidence: arr(str()),
  }),
  note: str(),                  // 디렉터에게 넘기는 한 줄 소견
});

/**
 * 판정 — 어제의 예측 vs 오늘의 결과.
 *
 * confidence 필드가 **없다.** 있으면 모델이 자기가 점수를 매기려 들고,
 * 0.65짜리 가설을 보면 마저 올려주고 싶어진다. 판정만 내고 폭은 코드가 정한다
 * (`hypothesis.mjs`의 MOVE).
 */
const VERDICT_SCHEMA = obj({
  verdicts: arr(obj({
    id: str(),                                              // 가설 id
    verdict: str(['supported', 'contradicted', 'no_data']),
    evidence: str(),                                        // 관측 기록의 값 그대로
    note: str(),                                            // 왜 그렇게 봤는가 한 줄
  })),
});

// 캐스팅 — 무대만. 욕망·회피 필드가 아예 없다(가설은 행동에서 읽는다).
const CASTING_SCHEMA = obj({
  world: obj({
    age: { type: 'integer' },
    situation: str(),
    season: str(),
    pressure: str(),
    // 접근 조건 — 디렉터가 이벤트 시각과 통로를 추측하지 않게 한다
    awake_window: str(),     // "22:00~04:00" 처럼 구체적인 구간
    outside_route: str(),    // 방 밖으로 나가는 유일한 통로. L2·골 맵의 입구
    channel: str(),          // 어느 인물을 통해 말이 닿는가
  }),
  cast: arr(obj({
    name: str(),
    relation: str(),
    tone: str(),
    presence: str(),
    pressure: str(),
  })),
  texture: str(),           // 주의가 향하는 결. 어디를 먼저 건드려볼지에만 쓴다 — 가설 아님
  gap_note: str(),          // 실제 나이 ↔ 플레이 나이 간극. 가설이 아니라 메모다
});

/**
 * 하루의 무대 — 각 공간에 오늘 무엇이 있는가.
 *
 * 고정 NPC는 없다. 인물도 사물도 날씨도 매일 디렉터가 새로 놓는다.
 * 중요한 건 "무엇이 있나"가 아니라 **opening — 다가가면 무슨 일이 벌어지나**다.
 * 대사는 미리 쓰지 않는다. 플레이어가 실제로 다가갔을 때 그 자리에서 생성된다.
 *
 * place와 look은 enum이 아니다. 맵이나 표현이 늘어도 스키마를 고치지 않는다 —
 * 코드가 아는 값만 받고 나머지는 조용히 버린다.
 */
const SCENE_SCHEMA = arr(obj({
  place: str(),            // 맵 id. 모르는 값이면 코드가 버린다
  weather: str(),          // '맑음' '비' '눈' … 없으면 '—'
  mood: str(),             // 이 공간의 오늘 첫인상 한 줄
  props: arr(obj({
    slot: str(),           // 그 맵의 빈 자리 id
    // 그리기 힌트. 자유 문자열로 열어두니 묘사가 들어와 고양이가 사물로 그려졌다 — enum으로 고정.
    look: str(['person', 'animal', 'object']),
    name: str(),           // '우는 아이' '비둘기 떼' '벤치에 놓인 지갑'
    detail: str(),         // 가까이 가면 보이는 것 한 줄
    opening: str(),        // ★ 발단. 다가가면 무슨 일이 벌어지는가
    // 3겹 중 어느 겹인가. analyst가 세어야 하므로 문장이 아니라 값이어야 한다.
    signal: str(['language', 'reaction', 'behavior', 'none']),
    watch: str(),          // 무엇을 볼 것인가. 자유 문장 — 관측의 기준
    target: str(),         // 확인하려는 가설 id 또는 'none'
  })),
}));

/**
 * 오늘 집 안의 물건들이 어떤 상태인가. **점수 없는 관찰 대상** (src/game/ambient.js).
 *
 * TV에 뭐가 나오는지, 냉장고에 뭐가 들어왔는지는 그날의 연출이다 —
 * 고정 문장을 돌려 쓰면 3일이면 다 읽힌다. 여기가 가장 값싼 밀도 공급원이다.
 */
const AMBIENT_SCHEMA = arr(obj({
  type: str(),      // 오브젝트 type. 모르는 값이면 코드가 버린다
  line: str(),      // 한 줄. 판단 없이 본 것만
}));

// 편성 — 무엇을 언제 왜 던질지 + 오늘의 무대
const PLAN_SCHEMA = obj({
  pacing: str(['순조로움', '늘어짐', '정체']),
  reasoning: str(),
  ambient: AMBIENT_SCHEMA,
  scenes: SCENE_SCHEMA,
  events: arr(obj({
    id: str(),
    at: str(),                                  // "10:30" 게임 내 시각
    kind: str(['dialogue', 'triple', 'nudge']),
    target: str(),                              // 가설 id 또는 "none"
    purpose: str(),
    signal_wanted: arr(str(['language', 'reaction', 'behavior'])),
    beat: str(),                                // 작가에게 넘길 상황 한 줄
  })),
});

/**
 * 골 맵 — confirmed된 가설 하나로 짓는 **그 사람만의 마지막 장소.** 게임당 1회.
 *
 * objects는 다른 맵과 같은 비전 JSON 형식이라 `buildRoom()`을 그대로 통과한다.
 * mirror는 거기 있는 인물 — 플레이어와 같은 모양이고, `mirror` AI가 이 설정으로 대화한다.
 */
const GOAL_SCHEMA = obj({
  label: str(),                                 // 공간 이름
  theme: str([...THEME_NAMES]),                 // 렌더링 결 (src/render/textures.js)
  arrive: str(),                                // 처음 들어섰을 때 한 줄
  reason: str(),                                // 왜 이렇게 지었는가 — 디버그 뷰·기술 문서용
  objects: arr(obj({
    type: str([...TYPES]),
    position: str([...WALL_POSITIONS, ...FLOOR_POSITIONS]),
    size: str([...SIZES]),
    cleanable: { type: 'boolean' },
  })),
  mirror: obj({
    name: str(),        // 이름 말고 상태로 — '그릇을 두고 가는 사람'
    look: str(['person']),
    detail: str(),      // 다가가면 보이는 것 한 줄
    opening: str(),     // 첫 마디. 플레이어를 부르지 않는다
    speech: str(),      // 말투 규칙. mirror AI가 이걸 읽는다
    stuck: str(),       // 이 인물이 못 넘는 것 = 플레이어의 문턱
    wants: str(),       // 원하는 것 = confirmed된 가설
  }),
});

const CHOICES = arr(obj({
  id: str(),
  text: str(),
  reads_as: str(),                              // 이 선택이 어떤 신호인가
}));

/**
 * 현실 인증 — **이 게임에서 점수가 붙는 마지막 행동.**
 *
 * 관대하게 본다. 시험이 아니라 확인이다. 실패해도 감점은 없고 다시 찍으면 된다.
 */
const REALITY_SCHEMA = obj({
  passed: { type: 'boolean' },
  reason: str(['ok', 'different', 'undone', 'unclear']),
  saw: str(),        // 본 것 한 줄. 칭찬도 평가도 하지 않는다 — 플레이어에게 그대로 보인다
});

// 거울 대화 — 마지막 장면. 4턴이면 끝난다.
const MIRROR_SCHEMA = obj({
  lines: arr(obj({ speaker: str(), text: str() })),
  choices: CHOICES,
  ending: { type: 'boolean' },                  // 마지막 턴인가
});

// 집필 — 실제 대사와 선택지
const SCRIPT_SCHEMA = obj({
  lines: arr(obj({ speaker: str(), text: str() })),
  choices: CHOICES,
  free_input: { type: 'boolean' },              // 결정적 장면이면 true
});

// 이어가기 — 플레이어가 직접 쓴 말에 대한 답
const REPLY_SCHEMA = obj({
  lines: arr(obj({ speaker: str(), text: str() })),
  choices: CHOICES,
  continue: { type: 'boolean' },                // 대화가 더 이어질 만한가
});

// ── 레지스트리 ──────────────────────────────────────────────

/**
 * effort — 분석은 높게(일관성), 집필은 중간(속도). DESIGN.md §5 호출 목록과 1:1.
 * vars   — prompts/*.md의 User Message 안 {{키}}를 채운다.
 */
export const AGENTS = {
  casting: {
    role: '캐스팅 — 설문에서 세계와 등장인물을 세운다 (가설은 만들지 않는다)',
    prompt: 'casting', schema: CASTING_SCHEMA, effort: 'high', maxTokens: 4000,
    vars: ['survey'],
  },
  'room-vision': {
    role: '비전 — 방 사진에서 오브젝트를 읽는다',
    prompt: 'room-vision', schema: ROOM_SCHEMA, effort: 'medium', maxTokens: 4000,
    vars: [],
  },
  referee: {
    role: '판정 — 어제의 예측과 오늘의 결과를 대조해 가설을 지지/반박한다 (confidence를 모른다)',
    prompt: 'referee', schema: VERDICT_SCHEMA, effort: 'high', maxTokens: 8000,
    vars: ['day', 'predictions', 'observed', 'dialogue', 'hypotheses'],
  },
  analyst: {
    role: '사용자 분석 — 행동·대화에서 회피 패턴과 숨은 욕망을 읽는다 (점수는 안 매긴다)',
    prompt: 'analyst', schema: ANALYSIS_SCHEMA, effort: 'high', maxTokens: 12000,
    vars: ['day', 'table', 'today', 'dialogue', 'observed'],
  },
  director: {
    role: '편성 — 내일 무엇을 언제 왜 던질지 정한다',
    prompt: 'director', schema: PLAN_SCHEMA, effort: 'high', maxTokens: 14000,
    vars: ['day', 'world', 'table', 'analysis', 'history', 'places'],
  },
  writer: {
    role: '집필 — 편성 1건을 실제 대사와 선택지로 만든다',
    prompt: 'writer', schema: SCRIPT_SCHEMA, effort: 'medium', maxTokens: 4000,
    vars: ['event', 'cast', 'context'],
  },
  'goal-map': {
    role: '골 맵 — **이 사람이 자기 입으로 한 말**에서 마지막 장소와 거울을 짓는다 (게임당 1회)',
    prompt: 'goal-map', schema: GOAL_SCHEMA, effort: 'high', maxTokens: 12000,
    vars: ['disclosed', 'confirmed', 'avoidance', 'world', 'typed'],
  },
  mirror: {
    role: '거울 — 골 맵의 인물이 플레이어와 나누는 마지막 대화 (실시간)',
    prompt: 'mirror', schema: MIRROR_SCHEMA, effort: 'medium', maxTokens: 3000,
    vars: ['mirror', 'turn', 'history', 'message'],
  },
  reality: {
    role: '현실 인증 — 실제로 한 일의 사진을 확인한다 (게임당 1회, 이것만 점수가 붙는다)',
    prompt: 'reality', schema: REALITY_SCHEMA, effort: 'medium', maxTokens: 2000,
    vars: ['claim'],
  },
  'npc-reply': {
    role: '이어가기 — 플레이어가 직접 쓴 말에 NPC가 답한다 (실시간)',
    prompt: 'npc-reply', schema: REPLY_SCHEMA, effort: 'medium', maxTokens: 2000,
    vars: ['npc', 'context', 'history', 'message'],
  },
};

export const agentList = () =>
  Object.entries(AGENTS).map(([name, a]) => ({ name, role: a.role, effort: a.effort }));

// ── 공통 실행기 ─────────────────────────────────────────────

const fill = (template, vars) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars?.[k];
    if (v === undefined || v === null) return '(없음)';
    return typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 정책 거절 시 다른 모델이 이어받게 한다. 조직에서 베타를 못 쓰면 폴백 없이 재시도.
 * 연결 끊김(status 없음)은 SDK 재시도를 넘겨도 가끔 나므로 여기서 한 겹 더 잡는다 —
 * 정산은 호출 4건이 이어져 있어 한 건만 실패해도 하루가 통째로 사라진다.
 */
async function call(params, attempt = 0) {
  const c = getClient();
  try {
    return await c.beta.messages.create({
      ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
  } catch (err) {
    if (err?.status === 400) {
      console.warn('[agents] server-side fallback 사용 불가 — 폴백 없이 재시도');
      return await c.messages.create(params);
    }
    // HTTP 상태가 없으면 연결 문제다. 두 번까지 더 시도한다.
    if (err?.status === undefined && attempt < 2) {
      const wait = 2000 * (attempt + 1);
      console.warn(`[agents] 연결 끊김 — ${wait}ms 뒤 재시도 (${attempt + 1}/2)`);
      await sleep(wait);
      return call(params, attempt + 1);
    }
    throw err;
  }
}

function readJson(res) {
  if (res.stop_reason === 'refusal') {
    const e = new Error(`요청이 거절됐다 (${res.stop_details?.category ?? 'unknown'})`);
    e.code = 'REFUSAL';
    throw e;
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

  // 잘린 JSON은 파서 에러("Unterminated string")로만 보여서 원인을 못 찾는다.
  // 구조화 출력이라 형식은 보장되니, 깨졌다면 사실상 max_tokens다 — 그렇게 말해준다.
  if (res.stop_reason === 'max_tokens') {
    const e = new Error(`출력이 max_tokens에서 잘렸다 (${res.usage?.output_tokens} tok). maxTokens를 올려라`);
    e.code = 'TRUNCATED';
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const e = new Error(`JSON 파싱 실패 (stop_reason=${res.stop_reason}, ${text.length}자): ${err.message}`);
    e.code = 'BAD_JSON';
    throw e;
  }
}

/**
 * AI 하나를 실행한다.
 * @param {string} name   AGENTS의 키
 * @param {object} vars   User Message의 {{키}}를 채울 값
 * @param {{image?: {data: string, mediaType: string}}} [extra]
 */
export async function runAgent(name, vars = {}, extra = {}) {
  const agent = AGENTS[name];
  if (!agent) {
    const e = new Error(`없는 AI: ${name}`);
    e.code = 'NO_AGENT';
    throw e;
  }

  const { system, user } = await loadPrompt(agent.prompt);

  // 캐시 키에 프롬프트 본문·스키마·모델·effort를 전부 넣는다 — 뭘 고쳐도 자동 무효화
  const key = cache.keyOf([
    name, MODEL, agent.effort, system, fill(user, vars), agent.schema,
    extra.image ? extra.image.data.slice(0, 64) + extra.image.data.length : null,
  ]);
  if (!extra.fresh) {
    const hit = await cache.get(key);
    if (hit) {
      console.log(`[${name}] cache hit  (아낀 토큰 in=${hit.usage.input} out=${hit.usage.output})`);
      return { data: hit.data, usage: { ...hit.usage, cached: true, ms: 0 } };
    }
  }

  const content = [];
  // 이미지는 텍스트보다 먼저 — 비전 정확도가 올라간다
  if (extra.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: extra.image.mediaType, data: extra.image.data },
    });
  }
  content.push({ type: 'text', text: fill(user, vars) });

  const t0 = Date.now();
  const res = await call({
    model: MODEL,
    max_tokens: agent.maxTokens,
    // 시스템 프롬프트는 매일 같다 — 캐시 읽기는 입력가의 0.1배다
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { effort: agent.effort, format: { type: 'json_schema', schema: agent.schema } },
  });

  const out = {
    data: readJson(res),
    usage: {
      agent: name,
      ms: Date.now() - t0,
      input: res.usage?.input_tokens ?? 0,
      output: res.usage?.output_tokens ?? 0,
      cache_read: res.usage?.cache_read_input_tokens ?? 0,
      cache_write: res.usage?.cache_creation_input_tokens ?? 0,
      model: res.model,
    },
  };
  await cache.put(key, out);
  return out;
}

/** 파이프라인 1단계 — 사진은 이 스코프 밖으로 나가지 않는다. */
export async function roomVision(imageBase64, mediaType) {
  const { data, usage } = await runAgent('room-vision', {}, {
    image: { data: imageBase64, mediaType },
  });
  return { vision: data, usage };
}

/** Act 4 — 실제로 한 일의 사진. 방 사진과 똑같이 이 스코프 밖으로 나가지 않는다. */
export async function checkReality(imageBase64, mediaType, claim) {
  const { data, usage } = await runAgent('reality', { claim }, {
    image: { data: imageBase64, mediaType },
    fresh: true,       // 사람마다 다른 사진이다. 캐시된 판정이 나가면 안 된다
  });
  return { verdict: data, usage };
}
