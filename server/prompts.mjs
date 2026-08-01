// 프롬프트 원본은 prompts/*.md 하나뿐이다. 서버가 그 파일에서 직접 읽어 쓴다.
// 코드에 복붙해두면 문서와 갈라진다 — 제출용 기술 문서에 그대로 첨부해야 하므로(CLAUDE.md) 갈라지면 안 된다.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `## <heading>` 바로 뒤에 오는 첫 코드펜스 내용을 꺼낸다.
 *
 * 펜스 길이를 그대로 맞춰 닫는다 — 프롬프트 안에 예시 블록(```)을 넣고 싶으면
 * 바깥을 ````로 열면 된다. 길이를 안 보면 중첩 예시에서 조용히 잘린다.
 */
function fenceAfter(md, heading, file) {
  const at = md.indexOf(`## ${heading}`);
  if (at < 0) throw new Error(`${file}: "## ${heading}" 섹션이 없다`);

  const rest = md.slice(at);
  const open = rest.match(/^(`{3,})[a-zA-Z]*\n/m);
  if (!open) throw new Error(`${file}: "## ${heading}" 아래에 코드펜스가 없다`);

  const start = open.index + open[0].length;
  const close = rest.indexOf(`\n${open[1]}`, start);
  if (close < 0) throw new Error(`${file}: "## ${heading}" 코드펜스가 닫히지 않았다`);

  return rest.slice(start, close).trim();
}

const cache = new Map();

/**
 * @param {string} name  prompts/<name>.md
 * @returns {Promise<{system: string, user: string}>}
 */
export async function loadPrompt(name) {
  if (cache.has(name)) return cache.get(name);

  const file = `prompts/${name}.md`;
  const md = await readFile(join(ROOT, file), 'utf8');
  const prompt = {
    system: fenceAfter(md, 'System Prompt', file),
    user: fenceAfter(md, 'User Message', file),
  };

  cache.set(name, prompt);
  return prompt;
}

/** 개발 중 프롬프트를 고쳤을 때 서버 재시작 없이 다시 읽기 위해. */
export const clearPromptCache = () => cache.clear();
export { fenceAfter as _fenceAfter };
