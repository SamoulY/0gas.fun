const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.CHAIN_DRY_RUN = '1';
process.env.AD_REQUIRED_SECONDS = '1';
process.env.ATTESTATION_SECRET = 'test-attestation-secret';
process.env.TMP_DIR = path.resolve(__dirname, '../tmp');
process.env.HUMAN_DATA_FILE = path.resolve(__dirname, '../tmp/test-human-data.jsonl');

const { createApp } = require('../backend/index');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(baseUrl, endpoint, payload) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

test('v2 data-collection flow reaches claim and writes dataset', async () => {
  fs.mkdirSync(path.resolve(__dirname, '../tmp'), { recursive: true });
  fs.rmSync(process.env.HUMAN_DATA_FILE, { force: true });

  const { app } = createApp();
  const server = app.listen(0);

  try {
    if (!server.listening) {
      await new Promise((resolve) => server.once('listening', resolve));
    }
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const started = await post(baseUrl, '/api/v2/session/start', {
      mode: 'data_collection',
      userAddress: '0x0000000000000000000000000000000000000001',
      source: 'test',
    });

    const challenge = await post(baseUrl, '/api/v2/challenge/generate', {
      sessionId: started.sessionId,
    });

    const verify = await post(baseUrl, '/api/v2/challenge/submit', {
      sessionId: started.sessionId,
      questionId: challenge.questionId,
      answer: '不是',
      metrics: { inputLatencyMs: 3000, editCount: 1 },
    });
    assert.equal(verify.accepted, true);

    await post(baseUrl, '/api/v2/self-label', {
      sessionId: started.sessionId,
      selfLabel: 'human',
    });

    const ad = await post(baseUrl, '/api/v2/ad/start', {
      sessionId: started.sessionId,
      provider: 'test',
      adUnitId: 'unit-test',
    });

    await post(baseUrl, '/api/v2/ad/event', {
      sessionId: started.sessionId,
      adSessionId: ad.adSessionId,
      eventType: 'click',
      meta: { source: 'test' },
    });

    await sleep(1100);

    const complete = await post(baseUrl, '/api/v2/ad/complete', {
      sessionId: started.sessionId,
      adSessionId: ad.adSessionId,
    });
    assert.equal(complete.completed, true);

    const claim = await post(baseUrl, '/api/v2/claim', {
      sessionId: started.sessionId,
      userAddress: '0x0000000000000000000000000000000000000001',
    });

    assert.equal(claim.success, true);
    assert.ok(claim.attestationToken);

    const fileContent = fs.readFileSync(process.env.HUMAN_DATA_FILE, 'utf8');
    assert.match(fileContent, new RegExp(started.sessionId));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
