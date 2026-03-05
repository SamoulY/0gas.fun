const test = require('node:test');
const assert = require('node:assert/strict');

const { fallbackAdAction } = require('../backend/adController');

test('ad action completes when time is met', () => {
  const result = fallbackAdAction({
    elapsedMs: 31_000,
    requiredMs: 30_000,
    clickCount: 0,
    lastUserEvent: null,
  });
  assert.equal(result.action, 'complete_ad');
});

test('ad action prompts click hint in middle stage', () => {
  const result = fallbackAdAction({
    elapsedMs: 8_000,
    requiredMs: 30_000,
    clickCount: 0,
    lastUserEvent: 'impression',
  });
  assert.equal(result.action, 'show_click_hint');
});
