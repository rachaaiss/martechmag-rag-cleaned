import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

export default async function handler(req, res) {
  // Autoriser les requêtes CORS (pour que ton widget WordPress puisse l'appeler)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,GET');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question." });
  }

  try {
    // 1. Recherche dans Supabase
    let { data: docs } = await supabase
      .from('martechmag_docs')
      .select('content, metadata')
      .textSearch('content', question, { type: 'websearch', config: 'english' })
      .limit(2);

    if (!docs || docs.length === 0) {
      const { data: fallbackDocs } = await supabase
        .from('martechmag_docs')
        .select('content, metadata')
        .limit(2);
      docs = fallbackDocs;
    }

    if (!docs || docs.length === 0) {
      return res.json({ answer: "No relevant content found in the knowledge base.", sources: [] });
    }

    // 2. Construction du contexte
    let context = "";
    const sources = [];
    docs.forEach((doc, index) => {
      context += `--- Source ${index + 1} [Type: ${doc.metadata.type} - Title: ${doc.metadata.title}] ---\n${doc.content}\n\n`;
      sources.push({ title: doc.metadata.title, type: doc.metadata.type });
    });

    // 3. Appel Groq
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
4. BREED & STYLE: Keep responses to 1 or 2 tight paragraphs maximum. Maintain a professional, sharp, and expert editorial style with no markdown tables and minimal bolding.`
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