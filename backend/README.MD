# GasFree Backend

Node.js server that:
- Generates adversarial questions via DeepSeek.
- Validates user answers.
- Signs and relays transactions on-chain.
- Sends 0.001 DEV rewards to verified users.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and set your keys.
3. Run `node index.js`

## API Endpoints
- `POST /api/generate-question` – Get a new question.
- `POST /api/verify-answer` – Submit answer and trigger reward.
- `POST /api/relay-transaction` – Relay a user transaction.
