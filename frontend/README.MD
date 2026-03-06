# GasFree Frontend Demo

React + Vite demo with dual flows:

- A: Standard verification (entry button -> popup question modal)
- B: Human data collection (direct Q&A + self-label)

Both flows include 30s ad playback, LLM ad-action prompts, and reward claim.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env`
3. `npm run dev`
4. Open `http://localhost:5173`

## Environment Variables

```env
VITE_API_BASE_URL=http://localhost:3000
```
