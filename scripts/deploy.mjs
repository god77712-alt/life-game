// 배포하고, **배포됐는지 확인까지 한다.**
//
// 이게 따로 있는 이유 — Render의 자동 배포가 조용히 멈춰 있던 적이 있다.
// 8커밋을 밀어놓고 폰에서 안 된다고 코드를 파헤쳤는데, 실제로는 첫 배포본이
// 그대로 떠 있었다. 밀었다는 것과 떠 있다는 것은 다른 얘기다.
//
// 그래서 훅을 치는 데서 끝내지 않고 **떠 있는 커밋이 방금 민 커밋이 될 때까지** 본다.
//
//   npm run deploy      지금 HEAD를 배포하고 올라올 때까지 기다린다
//
// .env 에 두 줄이 필요하다 (.env는 커밋되지 않는다):
//   RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-...?key=...
//   APP_URL=https://<주소>.onrender.com

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch { /* 환경변수로 넣었을 수 있다 */ }

const HOOK = process.env.RENDER_DEPLOY_HOOK;
const APP = (process.env.APP_URL || '').replace(/\/$/, '');

if (!HOOK || !APP) {
  console.error('.env 에 RENDER_DEPLOY_HOOK 과 APP_URL 이 필요하다 (.env.example 참고)');
  process.exit(1);
}

const head = execSync('git rev-parse --short=7 HEAD', { cwd: ROOT }).toString().trim();
const local = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
if (local) console.warn('⚠ 커밋 안 된 변경이 있다. 배포되는 건 HEAD까지다.\n');

const ahead = execSync('git log --oneline @{u}..HEAD', { cwd: ROOT }).toString().trim();
if (ahead) {
  console.error('⚠ 푸시되지 않은 커밋이 있다. Render는 GitHub에서 가져가므로 먼저 push할 것:\n' + ahead);
  process.exit(1);
}

console.log(`배포 요청  ${head}`);
const r = await fetch(HOOK, { method: 'POST' });
if (!r.ok) { console.error(`훅 실패 ${r.status}`); process.exit(1); }

// 올라올 때까지 본다. 빌드 2~3분 + 무료 플랜 콜드스타트를 감안해 넉넉히.
const started = Date.now();
const LIMIT_MS = 8 * 60 * 1000;
process.stdout.write('기다리는 중 ');

while (Date.now() - started < LIMIT_MS) {
  await new Promise((z) => setTimeout(z, 10000));
  let live = null;
  try {
    const res = await fetch(`${APP}/api/ping`, { signal: AbortSignal.timeout(20000) });
    live = (await res.json()).build;
  } catch { /* 재시작 중이라 잠깐 안 붙는다 */ }

  if (live === head) {
    console.log(`\n✅ ${head} 떠 있다  (${Math.round((Date.now() - started) / 1000)}초)`);

    // 떠 있다고 도는 건 아니다. **키가 실제로 되는지까지 본다** —
    // 값이 들어 있는 채로 401을 받으면 게임은 아무 말 없이 이벤트가 0건이 되고,
    // 그 상태로 나흘을 플레이했다. 배포는 성공인데 게임은 죽은 상태였다.
    try {
      const h = await (await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(30000) })).json();
      if (h.key) {
        console.log(`✅ Claude API 키 정상 (${h.model})`);
      } else {
        console.error(`\n❌ 배포는 됐지만 **AI가 안 돈다** — 이벤트·NPC·가설이 전부 0건이 된다`);
        console.error(`   ${h.keyPresent ? `키 값은 있는데 안 먹는다: ${h.keyError}` : '키가 아예 없다'}`);
        console.error(`   Render 대시보드 → Environment → ANTHROPIC_API_KEY 를 확인할 것`);
        process.exit(1);
      }
    } catch (e) {
      console.warn(`⚠ 키 확인 실패 (${e.message}) — 직접 /api/health 를 볼 것`);
    }
    process.exit(0);
  }
  process.stdout.write('.');
}

console.error(`\n❌ 8분 안에 안 올라왔다. Render 대시보드 Events에서 빌드 로그를 볼 것`);
process.exit(1);
