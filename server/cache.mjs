// 개발 중 같은 입력에 같은 응답을 재사용한다.
//
// 왜 — 프롬프트를 다듬는 동안 입력이 거의 같은 호출을 수십 번 돌리게 된다.
// 실제 플레이보다 개발 중 반복 호출이 훨씬 비싸다. 그걸 0원으로 만든다.
//
// 무효화는 자동이다. 키에 **프롬프트 본문·스키마·모델·effort**가 전부 들어가므로
// 프롬프트를 한 글자만 고쳐도 캐시가 안 맞는다. 낡은 응답을 볼 일이 없다.
//
//   AI_CACHE=0  으로 끄고, 요청에 x-no-cache 헤더를 붙이면 그 건만 새로 부른다.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');
export const enabled = () => process.env.AI_CACHE !== '0';

let hits = 0;
let misses = 0;
let saved = { input: 0, output: 0 };

export const keyOf = (parts) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);

export async function get(key) {
  if (!enabled()) return null;
  try {
    const raw = await readFile(join(DIR, `${key}.json`), 'utf8');
    const hit = JSON.parse(raw);
    hits += 1;
    saved.input += hit.usage?.input ?? 0;
    saved.output += hit.usage?.output ?? 0;
    return hit;
  } catch {
    misses += 1;
    return null;
  }
}

export async function put(key, value) {
  if (!enabled()) return;
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, `${key}.json`), JSON.stringify(value), 'utf8');
  } catch (e) {
    console.warn('[cache] 저장 실패', e.message);
  }
}

/** 아낀 돈. opus-5 기준 입력 $5 / 출력 $25 per 1M */
export async function stats() {
  let files = 0;
  try {
    files = (await readdir(DIR)).length;
  } catch { /* 아직 없음 */ }
  return {
    enabled: enabled(),
    entries: files,
    hits,
    misses,
    saved_usd: Number(((saved.input * 5 + saved.output * 25) / 1e6).toFixed(4)),
  };
}
