# 0gas.fun 代码库内部速览（Codex 自用）

> 目的：快速恢复对项目全貌的理解，便于后续改动时定位文件、接口和风险点。

## 1. 项目定位

0gas.fun 是一个“Gas 抽象 + 反女巫验证”演示项目：
- 用户在前端或 SDK 触发流程。
- 后端生成问题并判定回答是否“像人类”。
- 通过后端中继地址调用链上合约记录状态。
- 后端钱包再直接给用户转一笔测试链奖励（DEV）。

## 2. 高层架构

```text
[User + Wallet]
    |
    | (1) connect wallet / submit answer
    v
[Frontend React Demo]  or  [SDK gasfree.js embedded in DApp]
    |
    | HTTP
    v
[Backend Express]
    |- /api/generate-question
    |- /api/verify-answer
    |- /api/relay-transaction
    |
    | (2) optionally call DeepSeek API (question + answer classification)
    | (3) call GasFreeAI contract as relayServer
    | (4) send reward transfer from relayer wallet
    v
[EVM Network + GasFreeAI.sol]
```

## 3. 目录与代码组成

### `backend/`
- 技术栈：Node.js + Express + ethers v6 + axios。
- 关键文件：
  - `index.js`：所有 API 路由和核心业务流程都在这里。
  - `contract.js`：provider/wallet/contract 初始化，内置最小 ABI。
  - `config.js`：读取环境变量和固定奖励金额。
  - `prompts.js`：DeepSeek 的提问/判定提示词（中文）。
- 运行方式：`node index.js`（默认 `0.0.0.0:3000`）。

### `frontend/`
- 技术栈：React 19 + Vite。
- 关键文件：
  - `src/App.jsx`：完整演示流程 UI（连接钱包、答题、广告倒计时、结果页）。
  - `src/App.css`：主要样式。
  - `src/main.jsx`：挂载入口。
- 作用：Demo DApp，不是通用 SDK。

### `sdk/`
- `gasfree.js`：浏览器全局对象 `GasFree`，可嵌入任意 DApp。
- `sdk-useage-demo.html`：本地接入示例（文件名中 usage 拼写为 `useage`）。
- 核心 API：
  - `GasFree.init({ apiUrl })`
  - `GasFree.start({ userAddress, onSuccess, onError })`

### `contract/`
- `GasFreeAI.sol`：合约实现（合约名 `GasFreeAI_Fixed`）。
- 作用：记录验证与广告状态，限制仅 relayServer 可写，支持代付执行。

### `doc/`
- 当前只有 `pitchdeck.pdf`（产品材料）。
- 本文件放在这里作为工程说明补充。

## 4. 核心功能流（按真实代码）

### A. 生成问题
1. 客户端调用 `POST /api/generate-question`，传 `sessionId`。
2. 后端：
   - 有 `DEEPSEEK_API_KEY` 时调用 DeepSeek 生成问题；
   - 无 key 时从内置问题池随机返回。
3. 问题写入内存 `questionStore`（Map）并设置 5 分钟过期清理。

### B. 验证答案 + 发奖励
1. 客户端调用 `POST /api/verify-answer`，传：
   - `sessionId`, `question`, `answer`, `userAddress`, `adWatched`。
2. 后端校验：
   - 必填参数、session 匹配、5 分钟内、`adWatched` 为真。
3. 后端判定是否人类：
   - 有 DeepSeek key：模型分类返回 `human/ai`；
   - 无 key：启发式规则判断。
4. 通过后，后端链上执行三步：
   - `setUserVerified(user, question, answer, questionHash)`
   - `setUserAdWatched(user)`
   - relayer wallet 直接转 `0.001` DEV 给用户
5. 返回三笔交易哈希 + 奖励数量。

### C. 代付交易
1. 客户端可调用 `POST /api/relay-transaction`。
2. 后端先读 `contract.canUserExecute(userAddress)`。
3. 可执行则调用：
   - `executeForUser(userAddress, targetContract, data, value)`

## 5. 合约状态机要点（`GasFreeAI.sol`）

- 管理角色：
  - `owner`：可更新 `relayServer` 和广告有效时长。
  - `relayServer`：唯一允许写用户状态、代付交易的地址。
- 用户相关状态：
  - `aiVerified[user]`
  - `lastAdWatched[user]`
  - `usedQuestions[questionHash]`（防重放）
- 执行条件：
  - `aiVerified[user] == true`
  - `lastAdWatched[user]` 在 `adWatchDuration` 时间窗内（默认 30 秒）

## 6. 配置与环境变量

### 后端 `.env`
- `PORT`
- `PRIVATE_KEY`（relayer 私钥）
- `CONTRACT_ADDRESS`
- `RPC_URL`
- `DEEPSEEK_API_KEY`（可选）

### 前端 `.env`
- `VITE_API_BASE_URL`（默认 `http://localhost:3000`）
- `VITE_CONTRACT_ADDRESS`（当前代码中未实际使用）

## 7. 当前代码现状与风险记录（后续改造优先看这里）

1. 前端依赖缺失风险：
   - `frontend/src/App.jsx` 使用了 `axios` 和 `ethers`，
   - 但 `frontend/package.json` 未声明这两个依赖。
2. `questionStore` 是进程内存：
   - 服务重启丢状态，多实例间不共享（session 校验可能异常）。
3. `adWatched` 由客户端直接上传布尔值：
   - 当前实现里“是否看广告”缺少可验证证据，主要是演示逻辑。
4. 业务流程强耦合在 `backend/index.js`：
   - 路由、AI 调用、链上调用、奖励转账未分层，测试和维护成本高。
5. 奖励金额是硬编码常量：
   - `config.rewardAmount = '0.001'`，不可通过 env 配置。
6. SDK/前端都把广告计时作为前端倒计时实现：
   - 不是可信计时，不能防篡改。
7. 缺少自动化测试与 CI：
   - backend/frontend 都无实际测试脚本。

## 8. 后续改造建议（最小可行顺序）

1. 先修可运行性：补齐 frontend 依赖并验证完整本地联调。
2. 再拆后端：抽离 `services/`（ai, chain, reward）+ `routes/`。
3. 把 session 和挑战题存储迁移到 Redis（含 TTL）。
4. 把奖励金额、广告时长等迁移到可配置项。
5. 增加最小测试：
   - backend: API 单测（mock DeepSeek + mock ethers）
   - frontend: 流程级 UI 测试（至少主路径）
6. 如果要上线，需重做“广告完成证明”机制，避免仅信任前端参数。

