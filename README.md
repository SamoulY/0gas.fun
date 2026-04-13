# GasFree - 0gas.fun – The Universal Gas Abstraction Layer


---

### The Problem

**Web3’s Adoption Ceiling: Gas Fees & Sybil Attacks**

#### 🔴 **Gas Fees: The First Paywall**
- New users must acquire and hold a native token before any interaction → **99% drop‑off**.
- Developers cannot offer “free trials”, “gasless airdrops”, or subscription models – features that made Web2 successful.

#### 🔴 **Sybil Attacks: The Free‑Resource Killer**
- Every “gasless” scheme is quickly drained by bots.
- Traditional CAPTCHAs are broken; PoW wastes energy; KYC kills anonymity.
- Result: **Sustainable free‑to‑use models are impossible today.**

**We need a solution that removes the gas barrier AND stops bots – without compromising UX.**

---

### Our Solution

**GasFree = AI‑Powered Verification + Ad‑Sponsored Gas**

#### 🚀 **How It Works**
1. **DApp integrates our SDK** – one line of code.
2. **User clicks “Free Transaction”**:
   - SDK requests an **adversarial question** from our AI gateway (DeepSeek).
   - Question is trivial for humans but triggers over‑reasoning in LLMs.  
     *Example: “If water is liquid, is ice liquid?”*
3. **User answers & watches a 30‑second ad** (in a popup).
4. **AI validates the answer** – rejects bot‑like responses.
5. **On‑chain relay pays the gas** – user completes the action **with zero tokens**.

#### 🧠 **Why It Works**
- **Anti‑Sybil**: Questions are generated on‑the‑fly by an LLM; only humans answer them correctly and briefly.
- **Self‑sustaining**: Ad revenue covers gas costs + rewards developers.
- **Chain‑agnostic**: Works on any chain (and soon beyond).

---

### Vision & Traction

**Building the Default Gas Layer for Web3**

#### 🌍 **Use Cases**
- **Airdrops** – claim without gas.
- **NFT mints** – first mint is free.
- **Prediction markets** – free entry for new users.
- **Cross‑chain transactions** – pay destination gas via ads.

#### 📈 **Current Status**
- ✅ Live demo on testnet ([0gas.fun](http://0gas.fun))
- ✅ SDK ready – embed with `<script src="…?apiUrl=…">`
- ✅ Contract deployed (open source)

#### 💎 **Roadmap**
- **Now**: Multi‑chain support
- **Next**: Decentralized relay network
- **Future**: DAO governance & non‑EVM expansion

**Join us in making Web3’s first interaction as smooth as Web2.**

---

*For more: [GitHub](https://github.com/SamoulY/0gas.fun) · [Demo](http://0gas.fun) · [Docs](https://docs.0gas.fun)*

---

## 📦 Repository Structure
- `backend/` – Node.js server (Express) handling AI verification, relay signing, and contract interaction.
- `frontend/` – Example React app demonstrating the user flow.
- `sdk/` – Lightweight JavaScript SDK for embedding GasFree into any DApp with one line.
- `contract/` – Solidity smart contract (`GasFreeAI.sol`) that records user verification and ad‑watching status.
- `test/` – Repository-level tests for session flow, ad control, attestation, and API smoke checks.
- `tmp/` – Temporary runtime and test artifacts (created/used by test flows).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or later)
- npm or yarn
- MetaMask (for frontend demo)
- Moonbase Alpha testnet DEV tokens (for relayer)

### Smart Contract Deployment
Before running the backend, deploy the `GasFreeAI.sol` contract using **Remix** on your chosen EVM network (e.g., Moonbase Alpha). After deployment, copy the contract address and set it in the backend `.env` file.

### Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment example and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your private key, contract address, and RPC URL.
4. Start the server:
   ```bash
   node index.js
   ```
   The server will run on `http://localhost:3000`.

### Frontend Setup (Example DApp)
1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment example and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your private key, contract address, and RPC URL.
4. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

### Using the SDK
Include the SDK in your HTML:
```html
<script src="https://your-server.com/gasfree.js?apiUrl=http://localhost:3000"></script>
```
Then call `GasFree.start()`:
```javascript
GasFree.start({
  userAddress: '0x...',
  onSuccess: (result) => console.log('Reward:', result),
  onError: (err) => console.error(err)
});
```

---

## 📄 License
MIT

---

## Hedge Demo

仓库中新增了一个独立静态对冲算法演示页，位置在：

```text
frontend/public/hedge-demo/
```

安装依赖：

```bash
cd frontend
npm install
```

开发模式：

```bash
npm run hedge:dev
```

打开：

```text
http://localhost:5173/hedge-demo/index.html
```

刷新离线数据：

```bash
npm run hedge:data
```

生成可双击打开的单文件 HTML：

```bash
npm run hedge:single
```

一键构建前端并生成单文件：

```bash
npm run hedge:build
```

输出文件：

```text
frontend/public/hedge-demo/dist/hedge-demo.single.html
```
