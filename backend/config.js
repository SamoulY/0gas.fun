// config.js
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const repoRoot = path.resolve(__dirname, '..');
const tmpDir = process.env.TMP_DIR || path.join(repoRoot, 'tmp');

module.exports = {
  port: Number(process.env.PORT || 3000),
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
  rpcUrl: process.env.RPC_URL,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  rewardAmount: process.env.REWARD_AMOUNT || '0.001',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 5 * 60 * 1000),
  adRequiredSeconds: Number(process.env.AD_REQUIRED_SECONDS || 30),
  attestationSecret: process.env.ATTESTATION_SECRET || 'gasfree-dev-attestation-secret',
  attestationTtlMs: Number(process.env.ATTESTATION_TTL_MS || 10 * 60 * 1000),
  chainDryRun: process.env.CHAIN_DRY_RUN === '1' || process.env.CHAIN_DRY_RUN === 'true',
  tmpDir,
  humanDataFile: process.env.HUMAN_DATA_FILE || path.join(tmpDir, 'human_data_events.jsonl'),
};
