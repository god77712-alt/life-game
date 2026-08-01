// 이미 돌린 시뮬레이션을 감사 가능한 형태로 되살린다. **일회성 도구.**
//
// 추적 로그(`sim-trace-*.jsonl`)를 만들기 전에 돌린 회차는 감사를 할 수가 없다.
// 다행히 재료가 남아 있다 — 응답 캐시(.cache/*.json)에 그날의 analyst·director 응답이,
// 실행 로그에 그날의 다가감·지나침이 그대로 있다. 둘을 시간순으로 짝지어 복원한다.
//
// 새로 만들어내는 값은 없다. 전부 실제로 기록된 것이다.
//
//   node scripts/backfill-trace.mjs <실행로그.txt> [플레이어id]

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');
const [logPath, id = 'a'] = process.argv.slice(2);
if (!logPath) { console.error('사용법: node scripts/backfill-trace.mjs <실행로그.txt> [id]'); process.exit(1); }

// 1) 캐시에서 analyst·director 응답을 시간순으로
const files = await readdir(CACHE);
const rows = [];
for (const f of files) {
  if (!f.endsWith('.json') || f.startsWith('sim-')) continue;
  const p = join(CACHE, f);
  const j = JSON.parse(await readFile(p, 'utf8'));
  const d = j.data ?? j;
  const kind = d.hypotheses ? 'analyst' : d.scenes ? 'director' : null;
  if (!kind) continue;
  rows.push({ kind, at: (await stat(p)).mtimeMs, d });
}
rows.sort((a, b) => a.at - b.at);

// 2) 실행 로그에서 그날의 반응
const log = await readFile(logPath, 'utf8');
const days = new Map();
let cur = null;
for (const line of log.split('\n')) {
  const m = line.match(/^DAY (\d+)\s+오늘/);
  if (m) { cur = Number(m[1]); days.set(cur, { engaged: [], passed: [], typed: [] }); continue; }
  if (cur === null) continue;
  const e = line.match(/^\s+다가감: (.+)$/);
  if (e && e[1] !== '없음') days.get(cur).engaged = e[1].split(', ').map((w) => ({ what: w, sec: null }));
  const p = line.match(/^\s+지나침: (.+)$/);
  if (p && p[1] !== '없음') {
    days.get(cur).passed = p[1].split(', ').map((w) => {
      const g = w.match(/^(.*)\(([\d.]+)s\)$/);
      return g ? { what: g[1], sec: Number(g[2]) } : { what: w, sec: null };
    });
  }
  const t = line.match(/^\s+직접 씀: (.+)$/);
  if (t) days.get(cur).typed = [...t[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// 3) analyst(그날 판정) → director(다음날 무대) 순으로 짝지어 한 줄씩
const props = (plan) => (plan?.scenes ?? []).flatMap((s) =>
  (s.props ?? []).map((x) => ({ place: s.place, name: x.name, look: x.look, signal: x.signal, target: x.target })));

const analysts = rows.filter((r) => r.kind === 'analyst');
const directors = rows.filter((r) => r.kind === 'director');

const out = [];
for (let i = 0; i < analysts.length; i++) {
  const day = i + 1;
  const a = analysts[i].d;
  const nextPlan = directors[i]?.d ?? null;      // 이 판정 뒤에 짜인 무대 = 내일 것
  const stagedPlan = directors[i - 1]?.d ?? null; // 어제 짜인 무대 = 오늘 깔려 있던 것
  const obs = days.get(day) ?? { engaged: [], passed: [], typed: [] };
  out.push({
    day, player: id,
    staged: props(stagedPlan),
    engaged: obs.engaged, passed: obs.passed, unseen: [], typed: obs.typed,
    notifications: [],
    hypotheses: a.hypotheses.map((h) => ({
      id: h.id, desire: h.desire, statement: h.statement,
      confidence: h.confidence, verified: h.verified_count,
      kinds: [...new Set((h.signals ?? []).map((s) => s.kind))], missing: [],
    })),
    avoidance: a.avoidance?.pattern ?? '',
    pacing: nextPlan?.pacing, reasoning: nextPlan?.reasoning,
    next: props(nextPlan),
    backfilled: true,      // 복원본이다. missing·notifications는 남아 있지 않아 비어 있다
  });
}

await writeFile(join(CACHE, `sim-trace-${id}.jsonl`), out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`복원 ${out.length}일 → .cache/sim-trace-${id}.jsonl  (analyst ${analysts.length} / director ${directors.length})`);
