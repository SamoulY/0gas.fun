// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title GasFreeAI_Fixed
 * @notice 修复版合约：允许中继服务器为用户标记验证状态，而非记录中继自身
 */
contract GasFreeAI_Fixed {
    address public owner;
    address public relayServer;
    uint256 public adWatchDuration = 30 seconds;

    // 用户状态
    mapping(address => bool) public aiVerified;
    mapping(address => uint256) public lastAdWatched;
    mapping(bytes32 => bool) public usedQuestions; // 防重放

    // 事件
    event UserVerified(address indexed user, string question, string answer);
    event UserAdWatched(address indexed user, uint256 timestamp);
    event RelayServerUpdated(address indexed oldServer, address indexed newServer);
    event GasPaid(address indexed user, address indexed targetContract, bytes data);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRelay() {
        require(msg.sender == relayServer, "Only relay server");
        _;
    }

    constructor(address _relayServer) {
        owner = msg.sender;
        relayServer = _relayServer;
    }

    function updateRelayServer(address _newRelay) external onlyOwner {
        address old = relayServer;
        relayServer = _newRelay;
        emit RelayServerUpdated(old, _newRelay);
    }

    function setAdWatchDuration(uint256 _duration) external onlyOwner {
        adWatchDuration = _duration;
    }

    // 中继专用：记录用户通过 AI 验证
    function setUserVerified(
        address user,
        string calldata question,
        string calldata answer,
        bytes32 questionHash
    ) external onlyRelay {
        require(!usedQuestions[questionHash], "Question already used");
        usedQuestions[questionHash] = true;
        aiVerified[user] = true;
        emit UserVerified(user, question, answer);
    }

    // 中继专用：记录用户观看广告
    function setUserAdWatched(address user) external onlyRelay {
        lastAdWatched[user] = block.timestamp;
        emit UserAdWatched(user, block.timestamp);
    }

    // 中继专用：代付 Gas 执行目标合约（同时验证用户状态）
    function executeForUser(
        address user,
        address targetContract,
        bytes calldata data,
        uint256 value
    ) external onlyRelay returns (bytes memory) {
        require(aiVerified[user], "User not AI verified");
        require(lastAdWatched[user] >= block.timestamp - adWatchDuration, "Ad not watched recently");

        (bool success, bytes memory result) = targetContract.call{value: value}(data);
        require(success, "Execution failed");

        emit GasPaid(user, targetContract, data);
        return result;
    }

    // 查询用户是否可执行
    function canUserExecute(address user) external view returns (bool) {
        return aiVerified[user] && (lastAdWatched[user] >= block.timestamp - adWatchDuration);
    }

    receive() external payable {}
}