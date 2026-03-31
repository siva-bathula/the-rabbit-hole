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

async function fetchHeadlines() {
  for (const { url, type } of RSS_SOURCES) {
    try {
      console.log(`[trending] Fetching headlines from ${type}…`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RabbitHole/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.log(`[trending] Failed to fetch from ${type}, status: ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const parser = new XMLParser();
      const parsed = parser.parse(xml);

      const items = parsed?.rss?.channel?.item ?? [];
      const headlines = (Array.isArray(items) ? items : [items])
        .slice(0, 10)
        .map((item) => cleanTitle(item.title))
        .filter((t) => {
          if (!t) return false;
          const lower = t.toLowerCase();
          return !ERROR_STRINGS.some((e) => lower.includes(e));
        });

      // Require at least 3 valid headlines before accepting this source
      if (headlines.length >= 3) return headlines;
    } catch (err) {
      console.log(`[trending] Failed to fetch from ${type}, trying next source…`);
      console.error(`[trending] Error fetching from ${type}:`, err);
    } finally {
      continue;
    }
  }
  throw new Error('All RSS sources failed');
}

async function distilTopics(headlines) {
  console.log('[trending] Distilling topics from headlines:', headlines);
  const response = await withTimeout(
    client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a knowledge curator for an Indian audience.
You will receive a list of recent news headlines. From them, pick exactly 4 that would make great knowledge graph explorations and pair each with a concise topic label.

Rules:
- Topics must celebrate or inform about India — its achievements, culture, economy, science, history, sports, technology, space, arts, and people
- Prefer uplifting, educational, or aspirational topics over conflict or controversy
- STRICTLY AVOID any topic that is anti-Indian, politically divisive, religiously sensitive, or paints India in a negative light
- STRICTLY AVOID geopolitical conflicts, border disputes, war, terrorism, communal tensions, or any topic that could be seen as controversial within India
- The "label" must be a concise search-friendly noun phrase (2-5 words) that captures the specific news angle — NOT a generic category
- The "headline" must be the exact original headline (or very close) that inspired the topic
- Return ONLY a JSON object: { "topics": [ { "label": "...", "headline": "..." }, ... ] }`,
        },
        {
          role: 'user',
          content: `Here are today's top headlines:\n\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nPick 4 and return {label, headline} pairs.`,
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
  return data.topics.slice(0, 4).map((t) =>
    typeof t === 'string' ? { label: t, headline: t } : { label: t.label, headline: t.headline || t.label }
  );
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchAndCacheTrending() {
  if (isFetching) return;
  isFetching = true;

  try {
    console.log('[trending] Fetching RSS headlines…');
    const headlines = await fetchHeadlines();
    console.log(`[trending] Got ${headlines.length} headlines, distilling…`);
    const topics = await distilTopics(headlines);

    // Only update the cache if we got exactly 4 valid topics
    if (Array.isArray(topics) && topics.length === 4) {
      cachedTopics = topics;
      console.log('[trending] Cache updated:', topics);
    } else {
      console.warn('[trending] Skipping cache update — expected 4 topics, got:', topics?.length ?? 0);
    }
  } catch (err) {
    console.error('[trending] Failed:', err.message);
  } finally {
    isFetching = false;
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
