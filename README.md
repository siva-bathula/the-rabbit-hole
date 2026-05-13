# The Rabbit Hole

An interactive AI-powered knowledge graph explorer. Enter any topic and dive infinitely deep through connected concepts.

## Setup

### 1. Get a DeepSeek API Key
Sign up at [platform.deepseek.com](https://platform.deepseek.com) and create an API key.

### 2. Configure the server
```bash
cd server
copy .env.example .env
# Edit .env and add your DEEPSEEK_API_KEY
```

### Abuse protection (production)

LLM routes (`/api/explore`, `/api/expand`, `/api/explain`, `/api/deepen`, `/api/quiz`, `/api/compare`, `/api/followup`) expect **Cloudflare Turnstile**:

- **Server:** set `TURNSTILE_SECRET_KEY` in `server/.env`. Without it in production, those routes return `503` until configured (or set `DISABLE_TURNSTILE=1` only if you intentionally accept open endpoints).
- **Client:** set `VITE_TURNSTILE_SITE_KEY` in `client/.env` before `npm run build` so the SPA can mint tokens. Local dev can omit both keys; verification is skipped when no secret is set in development.

All **`POST /api/*`** requests in production must send an **`Origin`** header that matches `ALLOWED_ORIGINS` (comma-separated) or `http(s)://localhost:*`. That blocks naive curl/Postman; Turnstile blocks most scripted abuse that spoofs `Origin`.

**Rate limits:** `/api/*` stays at **10 requests per minute per IP** (shared Firestore counter in production by default). Tune in `server/index.js` if needed after Turnstile is live.

**Edge:** Putting the site behind **Cloudflare** (Bot Fight Mode, rate rules) adds another layer on top of application checks.

### Development (two terminals)
```bash
# Terminal 1 — API server on :4000
cd server && npm run dev

# Terminal 2 — Vite dev server on :3000 (proxies /api to :4000)
cd client && npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Production (single server)
```bash
# Build React into server/public/
npm run build

# Start Express serving everything on one port
npm start
```
Express serves the React SPA at `/` and the API at `/api/*` — one process, one port, one dyno.

## How to Use

- **Enter a topic** on the landing screen (e.g. "Quantum Mechanics", "The Roman Empire")
- **Click any node** to read an explanation in the overlay panel
- **"Go Deeper"** in the overlay expands that node into 5–7 subtopics
- **Scroll / pinch** to zoom, **drag** to pan, **drag nodes** to rearrange
- **New Search** returns to the landing screen

## Color Legend

| Color | Meaning |
|-------|---------|
| 🟡 Gold | Root topic |
| 🔵 Blue | Unexplored node |
| 🩵 Cyan | Expanded node |
| 🟣 Purple | Currently selected |
