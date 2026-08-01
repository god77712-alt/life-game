// 휴대폰 — 연락이 도착하고, **열지 말지를 플레이어가 고르는 곳.**
//
// 지금까지 이벤트는 시각이 되면 말풍선이 그냥 떴다. 그러면 그 선택이 없다.
// 그런데 이 게임이 재려는 신호가 정확히 그거다 — 누구 걸 열고 누구 걸 안 여는가.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Phone } from '../src/game/phone.js';

const msg = (from, text, id) => ({
  id,
  script: { lines: [{ speaker: from, text }], choices: [] },
  event: { id },
});

test('도착해도 열리지 않는다 — 여는 건 플레이어의 몫이다', () => {
  const p = new Phone();
  p.arrive(msg('지훈', '야 살아있냐', 'e1'), '16:00', 960);
  assert.equal(p.unread.length, 1);
  assert.equal(p.inbox[0].opened, false);
  assert.equal(p.inbox[0].delayMin, null);
});

test('미리보기는 앞부분만 — 전문이 보이면 열 이유가 없다', () => {
  const p = new Phone();
  const long = '나 오늘 회사 앞에서 넘어져서 무릎 다 까졌는데 아무도 안 봤으면 좋겠다고 생각했음';
  const m = p.arrive(msg('지훈', long, 'e1'), '16:00', 960);
  assert.ok(m.preview.length < 20, m.preview);
  assert.ok(m.preview.endsWith('…'));
  assert.ok(!m.preview.includes('무릎'));
});

test('열면 지연이 확정된다 — 이게 reaction 신호의 유일한 출처다', () => {
  const p = new Phone();
  p.arrive(msg('엄마', '밥 뒀다', 'e1'), '17:10', 1030);
  const m = p.open('e1', '22:30', 1350);
  assert.equal(m.delayMin, 320);
  assert.equal(m.openedAt, '22:30');
  assert.equal(p.unread.length, 0);
});

test('오래 기다린 것부터 열린다', () => {
  const p = new Phone();
  p.arrive(msg('엄마', '가', 'e1'), '10:00', 600);
  p.arrive(msg('지훈', '나', 'e2'), '18:00', 1080);
  assert.equal(p.next().id, 'e1');
  p.open('e1', '19:00', 1140);
  assert.equal(p.next().id, 'e2');
});

test('두 번 열리지 않는다', () => {
  const p = new Phone();
  p.arrive(msg('지훈', '가', 'e1'), '10:00', 600);
  assert.ok(p.open('e1', '11:00', 660));
  assert.equal(p.open('e1', '12:00', 720), null);
});

test('끝내 안 연 것도 기록된다 — 안 열었다는 게 곧 답이다', () => {
  const p = new Phone();
  p.arrive(msg('엄마', '가', 'e1'), '14:30', 870);
  p.arrive(msg('지훈', '나', 'e2'), '18:00', 1080);
  p.open('e2', '19:00', 1140);

  const out = p.summary();
  assert.equal(out.length, 2);
  const mom = out.find((m) => m.from === '엄마');
  assert.equal(mom.opened_at, null, '안 연 것이 사라지면 안 된다');
  assert.equal(mom.delay_min, null);
  assert.equal(out.find((m) => m.from === '지훈').delay_min, 60);
});

test('열 게 없으면 next는 null', () => {
  assert.equal(new Phone().next(), null);
});

test('시간이 거꾸로 가도 음수 지연은 안 나온다', () => {
  const p = new Phone();
  p.arrive(msg('지훈', '가', 'e1'), '23:50', 1430);
  const m = p.open('e1', '00:10', 10);      // 자정을 넘겼다
  assert.ok(m.delayMin >= 0);
});
