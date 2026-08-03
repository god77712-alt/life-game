// 가설 테이블 → 사람이 읽는 줄.
//
// **문자열을 만드는 곳은 여기 하나뿐이다.** 정산창과 DEV 패널이 따로 만들면
// 둘이 다른 말을 하기 시작한다 — 이미 한 번 겪었고(PROGRESS 8/1 버그표),
// 그때 얻은 규칙이 "디버그가 거짓말을 하면 안 된다"였다.
//
// 순수 함수만 둔다. Phaser도 DOM도 모른다 — 테스트가 이 파일을 그대로 부른다.

/** Act 이름 (CLAUDE.md §Act). 번호는 날짜가 아니라 가설 상태에서 나온다 */
export const ACT_NAMES = ['입장', '성장', '골 발견', '정점 → 붕괴', '현실 전환'];

/**
 * 지금 몇 막인가.
 *
 * 1~3은 서버가 가설 상태로 정한다(`hypothesis.mjs` applyStatus).
 * 4는 서버가 모른다 — 붕괴가 하루 지났는지는 클라이언트의 시계에만 있다.
 *
 * @param {object} table  분석 결과 (act 포함)
 * @param {{collapsed?:boolean, collapseNext?:boolean, collapsedOn?:number|null, day?:number}} s
 */
export function actOf(table, s = {}) {
  // 붕괴 하루가 지나야 현실 전환이다 (DESIGN.md §3). 붕괴 당일은 아직 3막
  if (s.collapsed && s.collapsedOn != null && (s.day ?? 0) > s.collapsedOn) return 4;
  if (s.collapsed || s.collapseNext) return 3;
  const n = table?.act;
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 1;
}

export function actLine(table, s = {}) {
  const n = actOf(table, s);
  return `Act ${n}  ${ACT_NAMES[n]}`;
}

/**
 * 가설 한 줄 이름.
 *
 * 가설의 형태가 "무엇에 끌리는가(desire)"에서 "누구에게 열리는가(who·through·when)"로
 * 바뀌었다(PROGRESS 8/1). 옛 필드를 읽던 자리가 그대로 남아 `undefined`를 띄우고 있었다 —
 * 여기서 한 번에 흡수한다. **어떤 모양이 와도 빈칸을 내지 않는다.**
 */
export function hypoLabel(h) {
  if (!h) return '—';
  if (h.label) return h.label;
  const parts = [h.who, h.through, h.when].filter((v) => v && v !== 'none');
  if (parts.length) return parts.join(' · ');
  return h.statement || h.desire || h.id || '—';
}

// ── 센 것만 보여준다 ─────────────────────────────────────────
//
// 예전에는 `testing 0.45`처럼 소수점 둘째 자리를 띄웠다. 그런데 그 숫자는 통계량이 아니라
// 코드가 판정마다 +0.10 / −0.15씩 옮긴 내부 카운터다(hypothesis.mjs MOVE).
// 자유 입력이 게임당 2~3회뿐인 n=1 자료로 **없는 정밀도를 주장하고 있었다.**
//
// 게임 행동으로 사람을 읽는 연구들의 상관은 대체로 r≈0.15~0.30이다. 실재하지만 작다.
// 그러니 화면에는 **실제로 센 것만** 적는다 — 몇 겹이 나왔나, 몇 번 검증됐나,
// 자기 얘기를 몇 번 했나. 전부 개수라서 물어보면 그대로 답할 수 있다.
//
// confidence 자체는 여전히 판정에 쓰이고 DEV 패널에는 남는다. 내부 값이니 디버그에는 맞다.

/** 3겹 신호 — 어느 겹이 비었는지가 숫자보다 많은 걸 말한다 */
const LAYER_LABEL = { language: '말', reaction: '반응', behavior: '행동' };

/**
 * 그 가설이 지금 무엇을 얼마나 갖고 있는가. **문턱은 서버가 보내준 값을 쓴다** —
 * 여기서 다시 적으면 hypothesis.mjs와 갈라지고 화면이 거짓말을 시작한다.
 */
export function counted(h, confirm = null) {
  const layers = confirm?.layers ?? ['language', 'reaction', 'behavior'];
  const kinds = new Set((h?.signals ?? []).map((s) => s.kind));
  const sig = layers.map((k) => `${LAYER_LABEL[k] ?? k}${kinds.has(k) ? '✓' : '·'}`).join(' ');

  const parts = [sig];
  parts.push(`검증 ${h?.verified_count ?? 0}/${confirm?.verifications ?? 2}`);
  parts.push(`자기얘기 ${h?.opened_to_who ?? 0}/${confirm?.needsOpening ?? 1}`);
  return parts.join(' · ');
}

/** confirmed가 맨 위, 그다음 confidence 높은 순. 버려진 가설은 빠진다 */
export function ranked(table) {
  return (table?.hypotheses ?? [])
    .filter((h) => h && !h.dropped && h.status !== 'dropped')
    .slice()
    .sort((a, b) => {
      const w = (h) => (h.status === 'confirmed' ? 2 : h.status === 'testing' ? 1 : 0);
      return w(b) - w(a) || (b.confidence ?? 0) - (a.confidence ?? 0);
    });
}

// ── 폭 맞추기 ────────────────────────────────────────────────
//
// 캔버스가 384px뿐이라 긴 문장은 상자를 뚫는다. 한글은 글자당 두 칸으로 세고
// 넘치면 자른다 — 자를 때는 잘렸다는 걸 보이게 남긴다(…).

const wide = (c) => c.charCodeAt(0) > 0x1100;   // 한글·한자·기호. 대충이지만 넘치지만 않으면 된다
const ELLIPSIS = '…';

export function cols(s) {
  let n = 0;
  for (const c of s) n += wide(c) ? 2 : 1;
  return n;
}

export function clip(s, max) {
  if (cols(s) <= max) return s;
  const room = max - cols(ELLIPSIS);   // '…'도 두 칸이다. 한 칸만 비워두면 딱 한 칸씩 넘친다
  let out = '';
  let n = 0;
  for (const c of s) {
    const w = wide(c) ? 2 : 1;
    if (n + w > room) break;
    out += c;
    n += w;
  }
  return `${out}${ELLIPSIS}`;
}

/** 정산창 한 줄이 넘지 않는 폭. 10px monospace · 상자 여백 40px 기준 */
export const WIDTH = 44;

// ── 정산창 블록 ──────────────────────────────────────────────

/**
 * 정산창 아래에 붙는 "디렉터가 지금 무엇을 알고 있는가".
 *
 * 며칠째고 뭐가 쌓였는지가 화면에 없었다. 시연 영상에서 이게 안 보이면
 * AI가 하는 일이 전부 로그에만 남는다 (CLAUDE.md — 가설 테이블 뷰는 필수).
 *
 * @param {object} table
 * @param {{pending?:boolean, error?:string, collapsed?:boolean, collapseNext?:boolean,
 *          collapsedOn?:number|null, day?:number, top?:number}} s
 * @returns {string[]}
 */
export function settleLines(table, s = {}) {
  const list = ranked(table);

  // **중요한 것부터 쌓는다.** 캔버스가 352px뿐이라 다 못 들어가는 날이 오는데,
  // 그때 정산창은 뒤에서부터 잘라낸다(ui/overlay.js). 순서가 곧 우선순위다.
  const out = ['─'.repeat(22)];
  out.push(list.length ? `${actLine(table, s)} · 가설 ${list.length}` : actLine(table, s));

  // 지금 무슨 일이 벌어지고 있는지가 가설보다 먼저다 — 이 화면은 기다리는 화면이다
  if (s.pending) out.push('오늘 하루를 읽는 중…');
  if (s.error) out.push(clip(`읽지 못했다 — ${s.error}`, WIDTH));

  if (list.length === 0) {
    // 첫 밤에는 아직 아무것도 없다. 비어 있다고 말하는 편이 빈칸보다 정직하다
    if (!s.pending && !s.error) out.push('아직 세운 가설이 없다');
    return out;
  }

  // 맨 위 가설만 자세히. 나머지는 한 줄씩 —
  // 디렉터가 여러 개를 놓고 재고 있다는 사실만 보이면 된다
  const [top, ...rest] = list;
  out.push(clip(hypoLabel(top), WIDTH));
  // **센 것만.** 소수점은 없는 정밀도를 주장한다 (위 주석 참고)
  out.push(top.status === 'confirmed'
    ? `★ 확인됨 — ${counted(top, table?.confirm)}`
    : clip(counted(top, table?.confirm), WIDTH));
  // 왜 아직 확정이 아닌가 — 서버가 붙여준다(hypothesis.mjs missing). 첫 줄만 보인다
  const block = top.missing?.[0];
  if (block && top.status !== 'confirmed') out.push(clip(`남은 것 — ${block}`, WIDTH));

  for (const h of rest.slice(0, s.rest ?? 2)) {
    out.push(clip(`· ${hypoLabel(h)}`, WIDTH));
  }

  if (table?.avoidance?.pattern) out.push(clip(`회피  ${table.avoidance.pattern}`, WIDTH));

  return out;
}

// ── DEV 패널 ─────────────────────────────────────────────────

/** 개발용 한 줄. 정산창과 **같은 함수**에서 나온 이름을 쓴다 */
export function devLine(table, s = {}) {
  const list = ranked(table);
  if (!list.length) return '';
  // DEV 패널에는 **내부값 그대로.** confidence는 판정에 실제로 쓰이는 값이라
  // 디버그에서는 보여야 한다 — 화면(정산창)에서만 센 것으로 바꾼 것이다
  const body = list
    .map((h) => `${hypoLabel(h)}(${h.status} conf${(h.confidence ?? 0).toFixed(2)} ${counted(h, table?.confirm)})`)
    .join('  ');
  return `가설   ${body}\n       ${actLine(table, s)}`;
}
