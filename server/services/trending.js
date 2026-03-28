import OpenAI from 'openai';
import { XMLParser } from 'fast-xml-parser';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const MODEL = 'deepseek-chat';

// Google News RSS — works reliably from cloud environments (GCP, etc.)
const RSS_SOURCES = [
  // India headlines by geo — most direct
  'https://news.google.com/rss/headlines/section/geo/IN?hl=en-IN&gl=IN&ceid=IN:en',
  // Search-based fallback
  'https://news.google.com/rss/search?q=india+news&hl=en-IN&gl=IN&ceid=IN:en',
];

let cachedTopics = [];
let isFetching = false;

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
  for (const url of RSS_SOURCES) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RabbitHole/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const parser = new XMLParser();
      const parsed = parser.parse(xml);

      const items = parsed?.rss?.channel?.item ?? [];
      const headlines = (Array.isArray(items) ? items : [items])
        .slice(0, 10)
        .map((item) => cleanTitle(item.title))
        .filter(Boolean);

      if (headlines.length > 0) return headlines;
    } catch {
      continue;
    }
  }
  throw new Error('All RSS sources failed');
}

async function distilTopics(headlines) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a knowledge curator for an Indian audience. 
You will receive a list of recent news headlines. From them, pick or distil exactly 4 concise topic labels (1-4 words each) that would make great knowledge graph explorations.

Rules:
- Prefer topics with depth — geopolitics, economics, science, culture, history — over pure breaking news
- Labels must be neutral and search-friendly (e.g. "India-Pakistan Tensions", "Operation Sindoor", "India's Defence Budget", "The Indus Waters Treaty")
- Avoid full sentences — keep it to a short noun phrase
- Return ONLY a JSON object: { "topics": ["...", "...", "...", "..."] }`,
      },
      {
        role: 'user',
        content: `Here are today's top headlines from Google News India:\n\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nDistil 4 topic labels from these.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const data = JSON.parse(response.choices[0].message.content);
  if (!Array.isArray(data.topics) || data.topics.length === 0) {
    throw new Error('Invalid topics response from AI');
  }
  return data.topics.slice(0, 4);
}

export async function fetchAndCacheTrending() {
  if (isFetching) return;
  isFetching = true;

  try {
    console.log('[trending] Fetching RSS headlines…');
    const headlines = await fetchHeadlines();
    console.log(`[trending] Got ${headlines.length} headlines, distilling…`);
    const topics = await distilTopics(headlines);
    cachedTopics = topics;
    console.log('[trending] Cache warmed:', topics);
  } catch (err) {
    console.error('[trending] Failed:', err.message);
  } finally {
    isFetching = false;
  }
}
