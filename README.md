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
