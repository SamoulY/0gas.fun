const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionManager } = require('../backend/sessionManager');

test('session manager handles standard flow claim conditions', () => {
  const manager = new SessionManager({ ttlMs: 60_000, adRequiredSeconds: 2 });
  const session = manager.createSession({ mode: 'standard', userAddress: '0xabc' });

  const challenge = manager.createChallenge(session.id, '如果水是液体，那冰是液体吗？');
  assert.ok(challenge.questionId);

  manager.submitAnswer(session.id, {
    questionId: challenge.questionId,
    answer: '不是',
    accepted: true,
    humanScore: 0.9,
    reasonCode: 'accepted',
    feedback: 'ok',
  });

  const ad = manager.startAd(session.id, {});
  ad.startedAt = Date.now() - 2_500;
  manager.completeAd(session.id, { adSessionId: ad.adSessionId });

  const claimCheck = manager.canClaim(session.id);
  assert.equal(claimCheck.ok, true);
});

test('data collection flow requires self-label before claim', () => {
  const manager = new SessionManager({ ttlMs: 60_000, adRequiredSeconds: 1 });
  const session = manager.createSession({ mode: 'data_collection' });

  const challenge = manager.createChallenge(session.id, '如果太阳从东边升起，那在金星上太阳从哪边升起？');

  manager.submitAnswer(session.id, {
    questionId: challenge.questionId,
    answer: '西边',
    accepted: true,
    humanScore: 0.8,
    reasonCode: 'accepted',
    feedback: 'ok',
  });

  const ad = manager.startAd(session.id, {});
  ad.startedAt = Date.now() - 1_200;
  manager.completeAd(session.id, { adSessionId: ad.adSessionId });

  const claimBeforeLabel = manager.canClaim(session.id);
  assert.equal(claimBeforeLabel.ok, false);
  assert.equal(claimBeforeLabel.reason, 'self_label_missing');

  manager.setSelfLabel(session.id, 'human');
  const claimAfterLabel = manager.canClaim(session.id);
  assert.equal(claimAfterLabel.ok, true);
});
