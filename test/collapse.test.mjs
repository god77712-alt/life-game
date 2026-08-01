// 붕괴 — 이 게임의 결말이자 메시지.
//
// 거울을 만난 다음 기상부터 게임 안의 모든 행동이 +0이 된다.
// **감점이 아니라 무득점이다.** 처벌하는 게 아니라 게임이 더 이상 아무것도 세지 않는 것이고,
// 그 침묵이 메시지다 (CLAUDE.md — 메시지는 말이 아니라 시스템으로 전달한다).
//
// RoomScene을 통째로 띄우려면 Phaser가 필요하므로, 점수 계산 규칙만 떼어 검사한다.
// 규칙이 바뀌면 이 테스트가 먼저 깨져야 한다.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TIER_SCORE } from '../src/game/actions.js';

/** RoomScene.scoreFor와 같은 규칙. 여기가 유일한 분기다. */
const scoreFor = (raw, collapsed) => (collapsed ? 0 : raw);

test('붕괴 전에는 거리 차등표 그대로', () => {
  for (const [tier, score] of Object.entries(TIER_SCORE)) {
    assert.equal(scoreFor(score, false), score, tier);
  }
});

test('붕괴 후에는 L0부터 L4까지 전부 0', () => {
  for (const [tier, score] of Object.entries(TIER_SCORE)) {
    assert.equal(scoreFor(score, true), 0, `${tier}가 아직 점수를 준다`);
  }
});

test('붕괴는 감점이 아니다 — 음수가 나오면 안 된다', () => {
  for (const score of [10, 15, 30, 50, 80]) {
    assert.ok(scoreFor(score, true) >= 0, '감점은 이 게임에 없다 (DESIGN.md §2)');
  }
});

test('골 맵 도달 자체는 붕괴 전이라 L4 +80을 준다', () => {
  // 마지막으로 점수가 붙는 행동. 그 다음 기상부터 0이 된다
  assert.equal(scoreFor(TIER_SCORE.L4, false), 80);
});
