const crypto = require('crypto');

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret, ttlMs) {
  const now = Date.now();
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + Number(ttlMs || 10 * 60 * 1000),
  };
  const body = toBase64Url(JSON.stringify(tokenPayload));
  const sig = toBase64Url(
    crypto.createHmac('sha256', secret).update(body).digest()
  );
  return `${body}.${sig}`;
}

function verifyPayload(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing_token' };
  }
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    return { valid: false, reason: 'invalid_format' };
  }

  const expectedSig = toBase64Url(
    crypto.createHmac('sha256', secret).update(body).digest()
  );
  if (sig !== expectedSig) {
    return { valid: false, reason: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(body));
  } catch (err) {
    return { valid: false, reason: 'bad_payload' };
  }

  if (!payload.exp || Date.now() > Number(payload.exp)) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

module.exports = {
  signPayload,
  verifyPayload,
};
