// 디렉터·분석가가 **제 기능을 하는지** 기계적으로 검사한다.
//
// 그럴듯한 글은 읽으면 다 맞는 말 같다. 그래서 글이 아니라 숫자로 묻는다:
//   반응이 없던 것을 치웠는가 / 반응이 있던 것을 이어갔는가 /
//   무대가 모자란 신호 겹을 노렸는가 / 증거 없는 가설이 내려갔는가 / 문장이 좁혀졌는가
//
// API를 부르지 않는다. `.cache/sim-trace-<id>.jsonl`만 읽는다.
//
//   node scripts/audit.mjs [플레이어id]        기본 a
//   node scripts/audit.mjs --diff a b          두 사람이 다른 곳으로 갔는가 (핵심 검사)

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');

const load = async (id) => {
  try {
    const raw = await readFile(join(CACHE, `sim-trace-${id}.jsonl`), 'utf8');
    const rows = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    // 같은 날이 두 번 있을 수 있다 (복원본 위에 다시 돌린 경우). 나중 것이 맞다.
    const byDay = new Map();
    for (const r of rows) byDay.set(r.day, r);
    return [...byDay.values()].sort((a, b) => a.day - b.day);
  } catch {
    return [];
  }
};

const PASS = '✓';
const FAIL = '✗';
const MEH = '·';

/** '골목의 계단 밑 새끼 고양이' → '계단 밑 새끼 고양이' */
const bare = (s) => String(s).replace(/^.*?의 /, '');

/** 이름이 얼마나 겹치는가. 프롭 이름은 매일 조금씩 바뀌므로 완전 일치로는 못 센다. */
function similar(a, b) {
  const ta = new Set(bare(a).split(/\s+/).filter((w) => w.length > 1));
  const tb = new Set(bare(b).split(/\s+/).filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}
const recurs = (name, list) => list.some((x) => similar(name, x) >= 0.5);

// ── 검사 ────────────────────────────────────────────────────

/**
 * 1. 적응 — 지나친 것은 빼고, 다가간 것은 이어가는가.
 * 무대가 관측과 무관하게 굴러가면 이 고리는 없는 것이다.
 */
function adaptation(rows) {
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i];
    const next = rows[i + 1].staged.map((p) => p.name);
    if (!next.length) continue;
    const dropped = r.passed.filter((p) => !recurs(p.what, next));
    const kept = r.engaged.filter((e) => recurs(e.what, next));
    out.push({
      day: r.day,
      passed: r.passed.length, dropped: dropped.length,
      engaged: r.engaged.length, kept: kept.length,
    });
  }
  return out;
}

/**
 * 2. 표적성 — 오늘 무대가 **모자란 신호 겹**을 노리는가.
 * confirmed는 3겹이 필요하다. 이미 있는 겹만 또 파면 영원히 못 간다.
 */
function targeting(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.next?.length) continue;
    const need = new Map(r.hypotheses.map((h) => [h.id, h.missing.filter((m) => /신호 부족/.test(m)).join('')]));
    const aimed = r.next.filter((p) => p.target && p.target !== 'none' && need.has(p.target));
    const onGap = r.next.filter((p) => {
      const gap = need.get(p.target);
      return gap && p.signal && gap.includes(p.signal);
    });
    out.push({ day: r.day, props: r.next.length, aimed: aimed.length, onGap: onGap.length });
  }
  return out;
}

/** 3. 감쇠 — 증거가 안 붙은 가설의 confidence가 내려가는가 (분석가가 부풀리기만 하는지) */
function decay(rows) {
  const seen = new Map();
  let up = 0, down = 0, flat = 0;
  for (const r of rows) {
    for (const h of r.hypotheses) {
      const prev = seen.get(h.id);
      if (prev !== undefined) {
        if (h.confidence > prev + 0.001) up += 1;
        else if (h.confidence < prev - 0.001) down += 1;
        else flat += 1;
      }
      seen.set(h.id, h.confidence);
    }
  }
  return { up, down, flat };
}

/** 4. 수렴 — 최고 confidence가 오르고, 문장이 길어지며(구체화) 좁혀지는가 */
function convergence(rows) {
  return rows.map((r) => {
    const top = [...r.hypotheses].sort((a, b) => b.confidence - a.confidence)[0];
    return top
      ? { day: r.day, desire: top.label ?? top.desire ?? top.id, who: top.who ?? 'none',
          conf: top.confidence, verified: top.verified, kinds: top.kinds.length }
      : { day: r.day, desire: '—', who: 'none', conf: 0, verified: 0, kinds: 0 };
  });
}

/**
 * 6. 판정 — referee가 실제로 반증을 내는가.
 * 전부 supported면 그건 채점이 아니라 응원이고, 전부 no_data면 아무것도 안 한 것이다.
 */
function refereeWork(rows) {
  const tally = { supported: 0, contradicted: 0, no_data: 0 };
  let days = 0;
  for (const r of rows) {
    if (!r.verdicts?.length) continue;
    days += 1;
    for (const v of r.verdicts) if (v.verdict in tally) tally[v.verdict] += 1;
  }
  const total = tally.supported + tally.contradicted + tally.no_data;
  return { ...tally, total, days };
}

/**
 * 5. 정체 — 같은 프롭이 반복되는가. 단, 반복 자체는 죄가 아니다.
 * 같은 대상을 계속 내면서 **가설이 오르고 있으면 조여가는 것**이고,
 * 올라가지 않으면 그때 굳은 것이다. 그 둘을 갈라서 센다.
 */
function stagnation(rows) {
  const runs = new Map();
  for (const r of rows) {
    for (const p of r.staged) {
      const key = [...runs.keys()].find((k) => similar(k, p.name) >= 0.5) ?? p.name;
      const e = runs.get(key) ?? { days: 0, targets: new Set() };
      e.days += 1;
      if (p.target && p.target !== 'none') e.targets.add(p.target);
      runs.set(key, e);
    }
  }
  const confOf = (id, r) => r.hypotheses.find((h) => h.id === id)?.confidence ?? null;
  const out = [];
  for (const [name, e] of runs) {
    if (e.days < 3) continue;
    // 이 프롭이 겨냥한 가설이 그동안 올랐는가
    let gained = false;
    for (const id of e.targets) {
      const series = rows.map((r) => confOf(id, r)).filter((v) => v !== null);
      if (series.length >= 2 && series[series.length - 1] > series[0]) gained = true;
    }
    out.push({ name: bare(name), days: e.days, gained });
  }
  return out.sort((a, b) => b.days - a.days);
}

// ── 출력 ────────────────────────────────────────────────────

function report(id, rows) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`플레이어 ${id} — ${rows.length}일치 기록`);
  console.log('='.repeat(70));
  if (!rows.length) {
    console.log('기록이 없다. `node scripts/simulate.mjs N --player=' + id + '`로 먼저 돌려라.');
    return null;
  }

  const ad = adaptation(rows);
  const tg = targeting(rows);
  const dc = decay(rows);
  const cv = convergence(rows);
  const st = stagnation(rows);

  console.log('\n[1] 적응 — 지나친 건 빼고 다가간 건 이어가는가');
  let dropSum = 0, dropTot = 0, keepSum = 0, keepTot = 0;
  for (const a of ad) {
    dropSum += a.dropped; dropTot += a.passed;
    keepSum += a.kept; keepTot += a.engaged;
    console.log(`   DAY ${a.day} → ${a.day + 1}   지나친 ${a.passed}개 중 ${a.dropped}개 뺌   다가간 ${a.engaged}개 중 ${a.kept}개 이어감`);
  }
  const dropRate = dropTot ? dropSum / dropTot : null;
  const keepRate = keepTot ? keepSum / keepTot : null;
  console.log(`   → 무반응 제거율 ${dropRate === null ? '—' : (dropRate * 100).toFixed(0) + '%'}  ${dropRate >= 0.6 ? PASS : dropRate === null ? MEH : FAIL}`);
  console.log(`   → 반응 추적률 ${keepRate === null ? '—' : (keepRate * 100).toFixed(0) + '%'}  ${keepRate >= 0.5 ? PASS : keepRate === null ? MEH : FAIL}`);

  const backfilled = rows.some((r) => r.backfilled);
  console.log('\n[2] 표적성 — 무대가 모자란 신호 겹을 노리는가');
  for (const t of tg) {
    console.log(`   DAY ${t.day}   프롭 ${t.props}개 중 가설 지목 ${t.aimed}개${backfilled ? '' : `, 그중 빈 겹 조준 ${t.onGap}개`}`);
  }
  const aimRate = tg.reduce((s, t) => s + t.aimed, 0) / Math.max(1, tg.reduce((s, t) => s + t.props, 0));
  console.log(`   → 지목률 ${(aimRate * 100).toFixed(0)}%  ${aimRate >= 0.7 ? PASS : FAIL}`);
  if (backfilled) console.log(`   ${MEH} 빈 겹 조준은 복원본에서 판정 불가 (missing이 남아 있지 않다)`);

  console.log('\n[3] 감쇠 — 증거 없는 가설이 내려가는가');
  console.log(`   상승 ${dc.up}회 / 하강 ${dc.down}회 / 유지 ${dc.flat}회`);
  console.log(`   → ${dc.down > 0 ? `${PASS} 내려간 적이 있다 (부풀리기만 하지 않는다)` : `${FAIL} 한 번도 안 내려갔다 — 증거와 무관하게 오르기만 한다`}`);

  console.log('\n[4] 수렴 — 최고 가설이 좁혀지는가');
  for (const c of cv) {
    console.log(`   DAY ${c.day}   ${String(c.conf).padEnd(5)} 검증${c.verified} 겹${c.kinds}  ${(c.who === 'none' ? '상대없음' : '→' + c.who).padEnd(9)} ${c.desire}`);
  }
  const first = cv[0]?.conf ?? 0;
  const last = cv[cv.length - 1]?.conf ?? 0;
  console.log(`   → ${first} → ${last}  ${last > first ? PASS : FAIL}`);

  console.log('\n[5] 정체 — 같은 프롭이 굳었는가 (반복 자체는 죄가 아니다)');
  if (!st.length) console.log(`   ${PASS} 3일 이상 반복된 프롭 없음`);
  for (const s of st) {
    console.log(`   ${s.gained ? PASS : FAIL} ${s.name} — ${s.days}일  ${s.gained ? '겨냥한 가설이 오르는 중 (조여가는 것)' : '가설이 안 오른다 (굳었다)'}`);
  }

  const rf = refereeWork(rows);
  console.log('\n[6] 판정 — referee가 반증을 내는가');
  if (!rf.total) {
    console.log(`   ${MEH} 판정 기록이 없다 (referee 도입 전 회차이거나 가설이 없었다)`);
  } else {
    const pct = (n) => `${n}건 (${Math.round((n / rf.total) * 100)}%)`;
    console.log(`   ${rf.days}일 ${rf.total}판정   지지 ${pct(rf.supported)}  반박 ${pct(rf.contradicted)}  자료없음 ${pct(rf.no_data)}`);
    console.log(`   → 반박 ${rf.contradicted ? PASS : FAIL} ${rf.contradicted ? '있다 (채점이지 응원이 아니다)' : '0건 — 지지만 하는 판정자는 판정자가 아니다'}`);
    console.log(`   → 자료없음 ${rf.no_data ? PASS : MEH} ${rf.no_data ? '있다 (모를 때 모른다고 한다)' : '0건 — 근거 없이도 판정하고 있다'}`);
  }

  return { cv, rows };
}

/**
 * 핵심 검사. 성향이 정반대인 두 사람이 **같은 곳으로 갔다면** AI는 읽는 게 아니다.
 * 위의 1~5는 전부 "그럴듯하게 움직인다"까지만 보여준다. 이것만이 "이 사람을 읽었다"를 가른다.
 */
function diff(a, b, rowsA, rowsB) {
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`대조 — ${a} vs ${b}: 다른 사람은 다른 곳으로 가는가`);
  console.log('#'.repeat(70));

  const topOf = (rows) => {
    const last = rows[rows.length - 1];
    return [...(last?.hypotheses ?? [])].sort((x, y) => y.confidence - x.confidence)[0];
  };
  const ta = topOf(rowsA);
  const tb = topOf(rowsB);
  console.log(`\n${a} 최고 가설: ${ta?.desire ?? '—'}  (conf ${ta?.confidence ?? '—'})`);
  console.log(`   ${ta?.statement ?? ''}`);
  console.log(`${b} 최고 가설: ${tb?.desire ?? '—'}  (conf ${tb?.confidence ?? '—'})`);
  console.log(`   ${tb?.statement ?? ''}`);

  const namesOf = (rows) => rows.flatMap((r) => r.staged.map((p) => bare(p.name)));
  const na = new Set(namesOf(rowsA));
  const nb = new Set(namesOf(rowsB));
  let shared = 0;
  for (const x of na) if ([...nb].some((y) => similar(x, y) >= 0.5)) shared += 1;
  const overlap = na.size ? shared / na.size : 0;

  console.log(`\n무대 겹침 ${(overlap * 100).toFixed(0)}%  (${shared}/${na.size})`);
  console.log(`가설 겹침 ${ta && tb && similar(ta.desire, tb.desire) >= 0.5 ? '있음' : '없음'}`);
  console.log(
    overlap < 0.4 && !(ta && tb && similar(ta.desire, tb.desire) >= 0.5)
      ? `\n${PASS} 두 사람이 다른 곳으로 갔다 — 디렉터는 관측에 반응하고 있다`
      : `\n${FAIL} 성향이 정반대인데 비슷한 곳으로 갔다 — 대본을 외운 것에 가깝다`
  );
}

// ── 실행 ────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args[0] === '--diff') {
  const [a, b] = [args[1] ?? 'a', args[2] ?? 'b'];
  const [ra, rb] = [await load(a), await load(b)];
  report(a, ra);
  report(b, rb);
  if (ra.length && rb.length) diff(a, b, ra, rb);
  else console.log('\n두 쪽 다 기록이 있어야 대조할 수 있다.');
} else {
  const id = args[0] ?? 'a';
  report(id, await load(id));
}
