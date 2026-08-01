// 서버가 prompts/*.md에서 프롬프트를 제대로 꺼내는지.
// 문서를 고쳤을 때 서버가 조용히 엉뚱한 걸 읽는 상황을 막는다.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPrompt, _fenceAfter } from '../server/prompts.mjs';
import { TYPES, WALL_POSITIONS, FLOOR_POSITIONS } from '../src/room/schema.js';

test('room-vision 프롬프트를 md에서 꺼낸다', async () => {
  const { system, user } = await loadPrompt('room-vision');

  assert.ok(system.length > 500, '시스템 프롬프트가 너무 짧다 — 추출 실패 의심');
  assert.ok(system.includes('2D 탑뷰'), '시스템 프롬프트 본문이 아니다');
  assert.ok(system.includes('## 스키마'), '스키마 절이 빠졌다');
  assert.ok(!system.includes('```'), '코드펜스가 섞여 들어왔다');

  assert.ok(user.includes('플레이어의 실제 방'), '유저 메시지가 아니다');
  assert.ok(user.length < 200, '유저 메시지가 너무 길다 — 다른 블록을 잡았다');
});

test('프롬프트가 코드의 enum을 전부 담고 있다', async () => {
  const { system } = await loadPrompt('room-vision');

  // 프롬프트에 없는 type을 코드가 기대하면 모델이 그 값을 낼 수 없다
  for (const t of TYPES) {
    assert.ok(system.includes(t), `프롬프트에 type "${t}"이 없다`);
  }
  for (const p of [...WALL_POSITIONS, ...FLOOR_POSITIONS]) {
    assert.ok(system.includes(p), `프롬프트에 position "${p}"이 없다`);
  }
});

test('프롬프트가 필수 오브젝트 규칙을 담고 있다', async () => {
  const { system } = await loadPrompt('room-vision');
  // schema.js가 주입하는 것과 프롬프트가 요구하는 것이 같아야 한다
  assert.ok(system.includes('bed') && system.includes('door') && system.includes('window'));
  assert.ok(/반드시 포함/.test(system), '필수 오브젝트 문구가 없다');
});

test('등록된 AI의 프롬프트가 전부 로드된다', async () => {
  const { AGENTS } = await import('../server/agents.mjs');
  for (const [name, agent] of Object.entries(AGENTS)) {
    const { system, user } = await loadPrompt(agent.prompt);
    assert.ok(system.length > 300, `${name}: 시스템 프롬프트가 비었다`);
    assert.ok(user.length > 10, `${name}: 유저 메시지가 비었다`);

    // User Message의 {{키}}가 레지스트리의 vars와 일치해야 한다.
    // 어긋나면 런타임에 조용히 "(없음)"이 들어가 모델이 헛것을 본다.
    const used = [...user.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    assert.deepEqual([...used].sort(), [...agent.vars].sort(), `${name}: {{변수}}와 vars 불일치`);
  }
});

test('분석 AI는 status를 스스로 정하지 않는다', async () => {
  const { system } = await loadPrompt('analyst');
  assert.ok(/status.*판정은 하지 마라|당신의 일이 아니다/.test(system),
    'status 판정 금지 문구가 빠졌다 — 상수가 흔들린다');
});

test('편성 AI는 대화를 기본값으로 삼는다', async () => {
  const { system } = await loadPrompt('director');
  assert.ok(system.includes('이것이 본체다'), '대화가 본체라는 원칙이 빠졌다');
  assert.ok(/기본값은 대화/.test(system));
});

test('섹션이 없으면 조용히 넘어가지 않고 터진다', () => {
  assert.throws(() => _fenceAfter('# 아무것도 없음', 'System Prompt', 'x.md'), /섹션이 없다/);
  assert.throws(() => _fenceAfter('## System Prompt\n펜스 없음', 'System Prompt', 'x.md'), /코드펜스가 없다/);
});
