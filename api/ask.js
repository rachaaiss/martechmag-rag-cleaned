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
  let clientData = rateLimitMap.get(ip);

  if (!clientData) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return true;
  }

  if (now - clientData.startTime > WINDOW_TIME_MS) {
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
  
  // CORS restreint au domaine d'origine
  const isAllowedOrigin = origin.includes('martechmag.com');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? origin : 'https://martechmag.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- RATE LIMITING PAR IP ---
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute before trying again.' });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question." });
  }

  try {
    // Recherche Full-Text sur Supabase
    let { data: docs } = await supabase
      .from('martechmag_docs')
      .select('content, metadata')
      .textSearch('content', question, { type: 'websearch', config: 'english' })
      .limit(2);

    // CORRECTION CRITIQUE : Pas de fallback aléatoire si aucun document n'est trouvé !
    if (!docs || docs.length === 0) {
      return res.status(200).json({ 
        answer: "No relevant content found in MartechMag's database for this topic.", 
        sources: [] 
      });
    }

    let context = "";
    const sources = [];
    docs.forEach((doc, index) => {
      const title = doc.metadata?.title || 'Untitled';
      const type = doc.metadata?.type || 'Article';
      context += `--- Source ${index + 1} [Type: ${type} - Title: ${title}] ---\n${doc.content}\n\n`;
      sources.push({ title, type });
    });

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: `You are the official AI Assistant for MartechMag (martechmag.com). 
Your sole purpose is to answer the user's questions accurately and concisely based ONLY on the provided context (articles, Lab Reports, and glossary).

CRITICAL RULES:
1. STRICTLY CONTEXT-BOUND: Use only the provided context. Never use external knowledge, never invent information, and never extrapolate beyond the provided texts. If the answer cannot be found in the context, state clearly that the information is not available in MartechMag's database.
2. LANGUAGE ENFORCEMENT: You must ALWAYS respond in professional English. If a user asks a question in another language (e.g., French, Turkish, Spanish), politely decline to switch languages and answer (or state that the info is missing) strictly in English.
3. DIRECT ANSWER FIRST: Address the exact concept the user is asking about immediately without generic introductions.
4. BREVITY & STYLE: Keep responses to 1 or 2 tight paragraphs maximum. Maintain a professional, sharp, and expert editorial style with no markdown tables and minimal bolding.`
        },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }
      ],
      temperature: 0.2,
    });

    const answer = completion.choices[0].message.content;
    return res.status(200).json({ answer, sources });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal RAG server error." });
  }
}