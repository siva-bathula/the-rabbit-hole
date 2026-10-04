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
- **Localhost + Turnstile:** If you set `VITE_TURNSTILE_SITE_KEY` locally but the widget shows **“Turnstile verification failed”**, your Turnstile widget in Cloudflare must allow **`localhost`** / **`127.0.0.1`** (widget hostname settings), or use Cloudflare’s **[official dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)** (`1x00000000000000000000AA` + matching secret) while developing.

- **Latency / sliding session:** The SPA exchanges one Turnstile widget token for a signed **`turnstileSession`** (`POST /api/turnstile/session`). Each successful AI response returns **`X-RH-Turnstile-Session`** so the browser can **slide** expiry without running Turnstile again until **idle** or **absolute max** lifetime is hit. Env: **`TURNSTILE_SESSION_SLIDE_SEC`** (seconds added per success; defaults like **`TURNSTILE_SESSION_TTL_SEC`**, default 600), **`TURNSTILE_SESSION_IDLE_SEC`** (default 1800), **`TURNSTILE_SESSION_MAX_ABS_SEC`** (default 86400). Tokens minted before sliding shipped only contain `{ exp }` (fixed window) until re-exchange. Optional **`TURNSTILE_SESSION_SECRET`** pins HMAC signing across deploys.

All **`POST /api/*`** requests in production must send an **`Origin`** header that matches `ALLOWED_ORIGINS` (comma-separated) or the request host (same-site). **`localhost` origins are rejected in production** — local dev uses the Vite proxy to a local API only. Turnstile blocks most scripted abuse that spoofs `Origin`.

**Rate limits:** `/api/*` stays at **10 requests per minute per IP** (shared Firestore counter in production by default). Tune in `server/index.js` if needed after Turnstile is live.

**Edge:** Putting the site behind **Cloudflare** (Bot Fight Mode, rate rules) adds another layer on top of application checks.

### Hide origin / block direct Cloud Run access

Traffic should flow **users → Cloudflare → Firebase Hosting → Cloud Run**, not to a public `*.run.app` URL.

**1. Cloud Run ingress (GCP — blocks raw `*.run.app`)**

```bash
gcloud run services update the-rabbit-hole \
  --project=therabbithole-491011 \
  --region=asia-south1 \
  --ingress=internal-and-cloud-load-balancing
```

Firebase Hosting rewrites still reach the service; casual `curl https://….run.app/…` should not.

**2. Edge secret (app + Cloudflare — blocks bypassing Cloudflare on your custom domain)**

Generate a long random secret and set it on Cloud Run (same value everywhere):

```bash
openssl rand -hex 32
```

- **Cloud Run env:** `RH_EDGE_SECRET=<that value>`
- **Cloudflare** → Rules → Transform Rules → **Modify Request Header** (origin request):
  - When: `(http.host eq "rabbitholeorg.org" or http.host eq "www.rabbitholeorg.org")`
  - Set static header: `X-RH-Edge-Secret` = same secret

The server accepts **`/api/*`** on custom-domain hosts when either the secret matches **or** standard Cloudflare origin headers are present (`CF-Connecting-IP`, etc.). Firebase Hosting often forwards Cloudflare headers but may strip custom `X-RH-*` headers — the CF check keeps the site working. Firebase default URLs (`*.web.app`, `*.firebaseapp.com`) are exempt. Direct `*.run.app` requests get **404**.

**Site broken with 403 on `/api`?** Remove `RH_EDGE_SECRET` from Cloud Run to restore service immediately, then redeploy after pulling the latest code.

**3. Authenticated Origin Pulls (optional, stronger)**

Cloudflare can present a client certificate to the origin. With **Firebase Hosting** in front of Cloud Run, the TLS origin is Google — not your Node process — so AOP is configured on Cloudflare → Firebase, not in Express. The edge secret above is the practical fit for this stack.

After deploy, verify: custom domain works in the browser; `curl https://….run.app/api/health` fails; `curl https://rabbitholeorg.org/api/trending` without the secret fails.

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
