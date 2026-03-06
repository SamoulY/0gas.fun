const test = require('node:test');
const assert = require('node:assert/strict');

const { signPayload, verifyPayload } = require('../backend/attestation');

test('attestation signs and verifies payload', () => {
  const secret = 'test-secret';
  const token = signPayload({ userAddress: '0x123' }, secret, 60_000);
  const verified = verifyPayload(token, secret);

  assert.equal(verified.valid, true);
  assert.equal(verified.payload.userAddress, '0x123');
});

test('attestation rejects tampered token', () => {
  const secret = 'test-secret';
  const token = signPayload({ userAddress: '0xabc' }, secret, 60_000);
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  const verified = verifyPayload(tampered, secret);

  assert.equal(verified.valid, false);
});
