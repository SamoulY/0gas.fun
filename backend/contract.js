// contract.js
const { ethers } = require('ethers');
const config = require('./config');

// 合约ABI（只包含需要用到的函数）
const contractABI = [
  "function setUserVerified(address user, string calldata question, string calldata answer, bytes32 questionHash) external",
  "function setUserAdWatched(address user) external",
  "function executeForUser(address user, address targetContract, bytes calldata data, uint256 value) external returns (bytes memory)",
  "function canUserExecute(address) view returns (bool)",
  "event UserVerified(address indexed user, string question, string answer)",
  "event UserAdWatched(address indexed user, uint256 timestamp)"
];

const isChainEnabled = Boolean(
  config.privateKey && config.rpcUrl && config.contractAddress
);

let provider = null;
let wallet = null;
let contract = null;

if (isChainEnabled) {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  wallet = new ethers.Wallet(config.privateKey, provider);
  contract = new ethers.Contract(config.contractAddress, contractABI, wallet);
}

module.exports = {
  provider,
  wallet,
  contract,
  contractABI, // 如果需要暴露
  isChainEnabled,
};
