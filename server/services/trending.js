import OpenAI from 'openai';
import { XMLParser } from 'fast-xml-parser';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const MODEL = 'deepseek-chat';

// Times of India top stories RSS — no API key, no rate limits
const RSS_URL = 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms';

let cachedTopics = [];
let isFetching = false;

export function getCachedTrending() {
  return cachedTopics;
}

async function fetchHeadlines() {
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RabbitHole/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);

  const xml = await res.text();
  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item ?? [];
  const headlines = (Array.isArray(items) ? items : [items])
    .slice(0, 10)
    .map((item) => item.title)
    .filter(Boolean);

  if (headlines.length === 0) throw new Error('No headlines found in RSS');
  return headlines;
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
        content: `Here are today's top headlines from Times of India:\n\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\nDistil 4 topic labels from these.`,
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
