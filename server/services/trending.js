import OpenAI from 'openai';
import { XMLParser } from 'fast-xml-parser';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const MODEL = 'deepseek-chat';

// Indian news RSS feeds — tried in order, first to return ≥3 valid headlines wins
const RSS_SOURCES = [
  // NDTV top stories
  {url: 'https://feeds.feedburner.com/ndtvnews-top-stories', type: 'ndtv'},
  // India Today
  {url: 'https://www.indiatoday.in/rss/1206578', type: 'indiatoday'},
  // The Hindu - National
  {url: 'https://www.thehindu.com/news/national/?service=rss', type: 'thehindu'},
  // Google News India geo (may be geo-blocked on some servers)
  {url: 'https://news.google.com/rss/search?q=india+news&hl=en-IN&gl=IN&ceid=IN:en', type: 'googlenews'},
];

// Strings that indicate the feed returned an error page rather than real headlines
const ERROR_STRINGS = [
  'this feed is not available',
  'feed not found',
  'page not found',
  '404',
];

let cachedTopics = [];
let isFetching = false;

const LLM_TIMEOUT_MS = 20000;
// Defensive ceiling for the entire refresh cycle (RSS fetch + LLM distillation).
// If anything hangs and never resolves/rejects, this watchdog ensures we recover.
const FETCH_WATCHDOG_MS = 50000;
const RSS_RETRY_ON_FAILURE_MS = 5 * 60 * 1000;
let fetchWatchdogTimer = null;
let fetchStartedAt = 0;
let rssRetryTimer = null;

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export function getCachedTrending() {
  if (cachedTopics.length === 0 && !isFetching) {
    fetchAndCacheTrending().catch(() => {});
  }
  return cachedTopics;
}

// Google News titles come as "Headline text - Source Name" — strip the source suffix
function cleanTitle(raw) {
  if (!raw) return '';
  return raw.replace(/\s[-–]\s[^-–]+$/, '').trim();
}

function textFromXmlField(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val['#text'] != null) return String(val['#text']);
  return String(val);
}

/** Strip tags / common entities so RSS HTML descriptions become plain text. */
function stripHtml(html) {
  const s = textFromXmlField(html);
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_SNIPPET_LEN = 1600;

function parseRssItem(item) {
  const rawTitle = textFromXmlField(item.title);
  const title = cleanTitle(rawTitle);
  let link = textFromXmlField(item.link);
  if (typeof item.link === 'object' && item.link?.['@_href']) link = item.link['@_href'];
  const desc =
    item.description ??
    item['content:encoded'] ??
    item.summary ??
    item['media:description'] ??
    '';
  const summary = stripHtml(desc).slice(0, MAX_SNIPPET_LEN);
  return { title, link: link.trim(), summary };
}

/** Match distillation headline back to RSS row (exact title; tolerant of minor LLM edits). */
function enrichTopicsWithRss(topics, items) {
  return topics.map((t) => {
    const headline = (t.headline || t.label || '').trim();
    let hit = items.find((i) => i.title === headline);
    if (!hit) {
      const h = headline.toLowerCase();
      hit = items.find((i) => i.title.toLowerCase() === h);
    }
    if (!hit) {
      hit = items.find(
        (i) =>
          headline.length > 12 &&
          (i.title.includes(headline.slice(0, 40)) || headline.includes(i.title.slice(0, 40))),
      );
    }
    const parts = [hit?.summary].filter(Boolean);
    if (hit?.link) parts.push(`Source URL: ${hit.link}`);
    const grounding = parts.join('\n\n').trim();
    return { label: t.label, headline: t.headline || t.label, link: hit?.link || '', summary: hit?.summary || '', grounding };
  });
}

async function fetchHeadlines() {
  for (const { url, type } of RSS_SOURCES) {
    try {
      console.log(`[trending] Fetching headlines from ${type}…`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RabbitHole/1.0)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.error(`[trending] Failed to fetch from ${type}, status: ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const parser = new XMLParser();
      const parsed = parser.parse(xml);

      const rawItems = parsed?.rss?.channel?.item ?? [];
      const itemList = Array.isArray(rawItems) ? rawItems : [rawItems];
      const parsedItems = itemList
        .slice(0, 12)
        .map(parseRssItem)
        .filter((row) => {
          if (!row.title) return false;
          const lower = row.title.toLowerCase();
          return !ERROR_STRINGS.some((e) => lower.includes(e));
        });

      // Require at least 3 valid headlines before accepting this source
      if (parsedItems.length >= 3) return parsedItems;
      console.warn(`[trending] Source ${type} returned only ${parsedItems.length} valid headlines`);
    } catch (err) {
      console.error(`[trending] Failed to fetch from ${type}, trying next source…`);
      console.error(`[trending] Error fetching from ${type}:`, err);
    }
  }
  throw new Error('All RSS sources failed');
}

async function distilTopics(headlines, rssItems) {
  console.log('[trending] Distilling topics from headlines:', headlines);
  const response = await withTimeout(
    client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a knowledge curator for an Indian audience.
You receive recent news headlines. Pick exactly 4 headlines that users can explore **as the specific story behind the headline** — not as a generic textbook topic.

Primary goal:
- The user will tap a chip and read a knowledge graph **about this news event**: what happened, who/what is involved, why it matters, background, and sensible next questions — all tied to THAT headline.
- The "label" is the short chip text; it must sound like a **specific story title** (3–7 words), NOT a broad category (bad: "Indian Aviation Industry", "Space Science"; good: "Artemis II crewed Moon flyby", "Telangana seniors pension bill").

Rules:
- Favour India-linked or India-relevant stories when possible (achievements, policy, economy, science, culture, sports, people).
- Prefer educational, civic, or constructive angles; avoid gratuitous shock or outrage framing.
- STRICTLY AVOID anti-Indian, hate, or exploitative angles; avoid operational detail that could enable harm.
- STRICTLY AVOID picking headlines whose exploration would require graphic violence, illegal instructions, or extremist content.
- The "headline" MUST be copied verbatim from the list (or trivial punctuation fix only).
- The "label" MUST clearly refer to the same event as its headline — a reader should see they belong together.
- Do NOT output generic labels that could apply to many unrelated articles.

Return ONLY a JSON object: { "topics": [ { "label": "...", "headline": "..." }, ... ] }`,
        },
        {
          role: 'user',
          content: `Headlines:\n\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nPick 4. For each: headline = exact line from the list; label = short story-specific title for that same event.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
    LLM_TIMEOUT_MS,
    'DeepSeek trending topics',
  );

  const data = JSON.parse(response.choices[0].message.content);
  if (!Array.isArray(data.topics) || data.topics.length === 0) {
    throw new Error('Invalid topics response from AI');
  }
  // Accept both old (string) and new ({label,headline}) formats gracefully
  const picked = data.topics.slice(0, 4).map((t) =>
    typeof t === 'string' ? { label: t, headline: t } : { label: t.label, headline: t.headline || t.label }
  );
  return enrichTopicsWithRss(picked, rssItems);
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchAndCacheTrending() {
  // If a previous run got stuck (promise never settled), allow recovery.
  if (isFetching) {
    const age = fetchStartedAt ? Date.now() - fetchStartedAt : 0;
    if (age > FETCH_WATCHDOG_MS) {
      console.warn('[trending] Watchdog: previous fetch stuck, resetting isFetching');
      isFetching = false;
    } else {
      return;
    }
  }

  isFetching = true;
  fetchStartedAt = Date.now();
  if (fetchWatchdogTimer) clearTimeout(fetchWatchdogTimer);
  fetchWatchdogTimer = setTimeout(() => {
    if (isFetching) {
      console.warn('[trending] Watchdog: fetch timed out, forcing isFetching=false');
      isFetching = false;
      fetchStartedAt = 0;
    }
  }, FETCH_WATCHDOG_MS);
  // Don't keep the process alive just for this timer.
  fetchWatchdogTimer.unref?.();

  try {
    console.log('[trending] Fetching RSS headlines…');
    let rssItems = [];
    try {
      rssItems = await fetchHeadlines();
    } catch (err) {
      console.error('[trending] Inner try :: Failed to fetch headlines:', err.message);
      throw err;
    }
    if (!Array.isArray(rssItems) || rssItems.length === 0) {
      throw new Error('Invalid headlines payload');
    }
    const headlines = rssItems.map((r) => r.title);
    console.log(`[trending] Got ${headlines.length} headlines, distilling…`);
    const topics = await distilTopics(headlines, rssItems);

    // Only update the cache if we got exactly 4 valid topics
    if (Array.isArray(topics) && topics.length === 4) {
      cachedTopics = topics;
      console.log('[trending] Cache updated:', topics);
    } else {
      console.warn('[trending] Skipping cache update — expected 4 topics, got:', topics?.length ?? 0);
    }
  } catch (err) {
    console.error('[trending] Failed:', err.message);
    if (err?.message === 'All RSS sources failed') {
      if (!rssRetryTimer) {
        console.warn(`[trending] All RSS sources failed — scheduling retry in ${RSS_RETRY_ON_FAILURE_MS / 60000} minutes`);
        rssRetryTimer = setTimeout(() => {
          rssRetryTimer = null;
          fetchAndCacheTrending().catch(() => {});
        }, RSS_RETRY_ON_FAILURE_MS);
        // Don't keep the process alive just for this timer.
        rssRetryTimer.unref?.();
      } else {
        console.log('[trending] RSS retry already scheduled, skipping duplicate timer');
      }
    }
  } finally {
    isFetching = false;
    fetchStartedAt = 0;
    if (fetchWatchdogTimer) {
      clearTimeout(fetchWatchdogTimer);
      fetchWatchdogTimer = null;
    }
  }
}

/**
 * Call once on server start. Runs an immediate fetch then refreshes
 * every 30 minutes in the background. The existing cache is never
 * cleared on failure — only replaced on a successful 4-topic fetch.
 */
export function startTrendingRefresh() {
  // Immediate warm-up
  fetchAndCacheTrending().catch(() => {});

  // Periodic refresh — unref() so this timer never prevents process exit
  const timer = setInterval(() => {
    console.log('[trending] Scheduled refresh triggered');
    fetchAndCacheTrending().catch(() => {});
  }, REFRESH_INTERVAL_MS);

  timer.unref();
  console.log(`[trending] Auto-refresh scheduled every ${REFRESH_INTERVAL_MS / 60000} minutes`);
}
