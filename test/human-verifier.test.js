const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFeedback } = require('../backend/humanVerifier');

test('short direct answer is accepted when model marks human', () => {
  const feedback = buildFeedback('不是', true, { inputLatencyMs: 3000, editCount: 1 });
  assert.equal(feedback.accepted, true);
  assert.ok(feedback.humanScore >= 0.45);
});

test('long reasoning answer tends to be rejected', () => {
  const feedback = buildFeedback('因为水结冰后分子结构变化，所以它是固体而不是液体。', false, {
    inputLatencyMs: 600,
    editCount: 0,
  });
  assert.equal(feedback.accepted, false);
  assert.equal(feedback.reasonCode, 'over_reasoning');
});
