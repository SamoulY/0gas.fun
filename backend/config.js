// config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
  rpcUrl: process.env.RPC_URL,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  rewardAmount: '0.001', // DEV奖励数量
};
