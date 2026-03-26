import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const MODEL = 'deepseek-chat';

export async function generateNodes(topic) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a knowledge graph generator. The user may provide a question or a plain topic — either way, extract the core concept and build a knowledge graph around it.

Return ONLY a JSON object with exactly these fields:
- "nodes": array of objects, each with { "id": string, "label": string, "group": string }
- "edges": array of objects, each with { "source": string, "target": string }

CRITICAL RULES — you must follow these exactly:
1. The root node MUST have id exactly equal to the string "root" (not any other value).
2. The root node label MUST be the full learning subject — include the concept AND any relevant language, domain, or context from the user's input (e.g. "BIT in JavaScript", "Macroeconomics Basics", "Roman Empire History"). Keep it concise (2-6 words). Do NOT copy the full question verbatim.
3. All child nodes must have unique IDs like "node_1", "node_2", etc.
4. Every child node MUST have an edge with source "root" pointing to it. No child node should be left unconnected.
5. Generate 8-12 child nodes total.
6. Groups can be: "core", "application", "history", "theory", "impact", "related"
7. Child node labels should be concise (1-4 words max).`,
      },
      {
        role: 'user',
        content: `Topic: ${topic}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}

export async function expandNode(nodeId, nodeLabel, parentContext, existingLabels) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a knowledge graph expander. Given a concept, generate 5-7 deeper, more specific subtopics or related concepts.

Return ONLY a JSON object with exactly these fields:
- "nodes": array of objects, each with { "id": string, "label": string, "group": string }
- "edges": array of objects, each with { "source": string, "target": string }

Rules:
1. Use id "parent" to reference the input concept node in edges (as source)
2. New nodes get IDs like "child_1", "child_2", etc.
3. All edges should have source "parent" pointing to each new child
4. Groups can be: "core", "application", "history", "theory", "impact", "related", "example", "mechanism"
5. DO NOT repeat any concepts already in the graph
6. Go deeper and more specific than the parent concept
7. Labels should be concise (1-4 words max)`,
      },
      {
        role: 'user',
        content: `Concept to expand: "${nodeLabel}"
Context/parent topic: ${parentContext}
Already in graph (do not repeat): ${existingLabels.join(', ')}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  const data = JSON.parse(response.choices[0].message.content);

  // Namespace all new node IDs to avoid collisions
  const prefix = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
  const remappedNodes = data.nodes.map((n) => ({
    ...n,
    id: `${prefix}_${n.id}`,
  }));
  const remappedEdges = data.edges.map((e) => ({
    source: e.source === 'parent' ? nodeId : `${prefix}_${e.source}`,
    target: e.target === 'parent' ? nodeId : `${prefix}_${e.target}`,
  }));

  return { nodes: remappedNodes, edges: remappedEdges };
}

const CODE_KEYWORDS = [
  'code', 'implement', 'example', 'snippet', 'syntax', 'usage',
  'sample', 'demo', 'program', 'script', 'function', 'method',
];

// Root topic keywords that indicate the whole graph is code/programming-related.
// When matched, ALL nodes get code examples regardless of their own label.
const CODE_ROOT_KEYWORDS = [
  'javascript', 'python', 'java', 'typescript', 'golang', 'rust', 'c++', 'c#',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'dsa', 'data structure', 'algorithm',
  'leetcode', 'programming', 'coding', 'react', 'angular', 'vue', 'node.js',
  'express', 'django', 'flask', 'sql', 'nosql', 'sorting', 'binary tree',
  'linked list', 'recursion', 'dynamic programming', 'big-o', 'backend', 'frontend',
  'web development', 'api design', 'design pattern',
];

function isCodeNode(label) {
  const lower = label.toLowerCase();
  return CODE_KEYWORDS.some((kw) => lower.includes(kw));
}

function isCodeRootTopic(rootTopic) {
  const lower = (rootTopic || '').toLowerCase();
  return CODE_ROOT_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function explainNode(nodeLabel, parentContext, rootTopic = '') {
  const isRoot = !parentContext || parentContext === nodeLabel;
  const needsCode = isCodeNode(nodeLabel) || isCodeRootTopic(rootTopic);

  const codeField = needsCode
    ? `- "code": a working, well-commented code example string demonstrating "${nodeLabel}" (use the language implied by the context, default to JavaScript). Include only the code — no markdown fences.`
    : '';

  const learnMoreField = `- "learnMore": an object with "title" (string) and "url" (string) pointing to ONE reputable external resource — for example MDN Web Docs for web APIs, official documentation for frameworks/languages, Investopedia for finance terms, Khan Academy for educational topics, or a well-known authoritative site. Only include a URL you are highly confident is real and accurate. Do NOT invent URLs.`;

  const toneInstruction = `Write in the voice of a knowledgeable, warm Indian educator — think of a brilliant senior colleague from an IIT or a seasoned professional explaining things over chai. Use natural Indian English: phrases like "basically", "actually", "you see", "only" for emphasis (e.g. "this is used only when…"), and the occasional "isn't it?" or "right?" to keep it conversational. Where it fits naturally, use analogies from everyday Indian life — cricket, local markets, traffic, tiffin boxes — but never force them. Be direct, confident, and make the reader feel like they are getting the real explanation, not a textbook answer.`;

  const systemPrompt = isRoot
    ? `You are a clear, engaging educator. The user is exploring "${nodeLabel}" as their main topic.

${toneInstruction}

Return ONLY a JSON object with exactly these fields:
- "title": the concept name (string)
- "summary": 2-3 sentence overview of what this topic is and why it matters (string)
- "details": array of 3-4 key insight strings that give a high-level map of the territory — what are the most important things to understand about this topic? (array of strings)
- "related": array of 3-5 subtopics or adjacent concepts worth exploring (array of strings)
${learnMoreField}
${codeField}

Be specific and concrete. Write like a brilliant friend giving a first orientation to the topic.`
    : `You are a clear, engaging educator. The user is exploring "${nodeLabel}" as a subtopic within "${parentContext}".

${toneInstruction}

CRITICAL RULES:
1. Do NOT re-introduce or re-explain "${parentContext}" — assume the user already understands it.
2. Focus ENTIRELY on what is specific and unique to "${nodeLabel}" within the context of "${parentContext}".
3. Every sentence must be directly about "${nodeLabel}". No generic filler.

Return ONLY a JSON object with exactly these fields:
- "title": the concept name (string)
- "summary": 2-3 sentences explaining what "${nodeLabel}" specifically means or does in the context of "${parentContext}" (string)
- "details": array of 3-4 key insight strings, each revealing something non-obvious or particularly important about "${nodeLabel}" as it applies to "${parentContext}" (array of strings)
- "related": array of 3-5 related concept labels the user might want to explore next (array of strings)
${learnMoreField}
${codeField}

Be precise and specific. Every word should earn its place.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: isRoot
          ? `Topic: "${nodeLabel}"`
          : `Subtopic: "${nodeLabel}"\nParent topic: "${parentContext}"`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}
