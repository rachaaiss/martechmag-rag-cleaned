import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

const rateLimitMap = new Map();
const WINDOW_TIME_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const clientData = rateLimitMap.get(ip);

  if (!clientData || (now - clientData.startTime > WINDOW_TIME_MS)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return true;
  }

  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  clientData.count++;
  return true;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  const isAllowedOrigin = origin.includes('martechmag.com');

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? origin : 'https://martechmag.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { question } = req.body;
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Valid question parameter is required.' });
  }

  try {
    const cleanQuery = question.replace(/[^\w\s]/gi, '').trim();

    let { data: docs, error: searchError } = await supabase
      .from('martechmag_docs')
      .select('content, metadata')
      .textSearch('content', cleanQuery, { type: 'websearch', config: 'english' })
      .limit(3);

    if (searchError) {
      console.error('Supabase search error:', searchError);
    }

    if (!docs || docs.length === 0) {
      const keywords = cleanQuery.split(/\s+/).filter(word => word.length > 2);
      if (keywords.length > 0) {
        const primaryKeyword = keywords[keywords.length - 1];
        const { data: fallbackDocs } = await supabase
          .from('martechmag_docs')
          .select('content, metadata')
          .ilike('content', `%${primaryKeyword}%`)
          .limit(2);

        docs = fallbackDocs || [];
      }
    }

    if (!docs || docs.length === 0) {
      return res.status(200).json({
        answer: "No relevant content found in MartechMag's database for this topic.",
        sources: []
      });
    }

    let context = '';
    const sources = [];

    docs.forEach((doc, index) => {
      const title = doc.metadata?.title || 'Untitled';
      const type = doc.metadata?.type || 'Article';
      context += `<source id="${index + 1}" type="${type}" title="${title}">\n${doc.content}\n</source>\n\n`;
      sources.push({ title, type });
    });

    const SYSTEM_PROMPT = `<role>
You are the official AI Assistant for MartechMag (martechmag.com), specialized in B2B MarTech, marketing operations, and adtech.
</role>

<instructions>
1. GROUNDING: Answer the query using ONLY the provided context blocks wrapped in <source> tags. Do not use pre-trained knowledge or external information.
2. MISSING INFO: If the context does not contain enough information to provide a clear answer, respond strictly with: "No relevant content found in MartechMag's database for this topic."
3. LANGUAGE: Always respond in professional, concise English regardless of the prompt language.
4. FORMAT & STYLE:
   - Provide direct, executive-level insights immediately.
   - Limit responses to 1 or 2 high-density paragraphs.
   - Avoid conversational filler (e.g., "Based on the provided sources...", "Sure! Here is...").
   - Do not use markdown tables or heavy formatting.
</instructions>

<few_shot_example>
User Question: What is ABM?
Ideal Response: Account-Based Marketing (ABM) is a strategic growth strategy where marketing and sales teams collaborate to create personalized buying experiences for a mutually agreed-upon set of high-value accounts. Rather than casting a wide net, ABM focuses resources on engaging specific decision-makers within target organizations.
</few_shot_example>`;

    const USER_PROMPT = `<context>\n${context}</context>\n\n<user_question>${question}</user_question>`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ],
      temperature: 0.1
    });

    const answer = completion.choices[0]?.message?.content || "No response generated.";
    return res.status(200).json({ answer, sources });

  } catch (err) {
    console.error('RAG Pipeline Error:', err);
    return res.status(500).json({ error: 'Internal RAG server error.' });
  }
}