# GasFree Backend

Node.js server for challenge verification, ad-proof gating, reward claim, and relay execution.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill values.
3. Run `node index.js`

## V2 API (recommended)

- `POST /api/v2/session/start` – Create verification session (`standard` / `data_collection`).
- `POST /api/v2/challenge/generate` – Generate challenge question for session.
- `POST /api/v2/challenge/submit` – Submit answer and get feedback + human score.
- `POST /api/v2/self-label` – Save user self-label (`human` / `not_human`) for data collection mode.
- `POST /api/v2/ad/start` – Start 30s ad playback session.
- `POST /api/v2/ad/event` – Report ad interaction events.
- `POST /api/v2/ad/llm-action` – Get LLM ad control action (whitelisted).
- `POST /api/v2/ad/complete` – Complete ad after required duration.
- `POST /api/v2/claim` – Claim reward + receive attestation token.
- `POST /api/v2/relay-transaction` – Execute relay transaction with attestation.

## Legacy Compatibility

- `POST /api/generate-question`
- `POST /api/verify-answer`
- `POST /api/relay-transaction`

These legacy endpoints remain available for older SDK/frontends.
