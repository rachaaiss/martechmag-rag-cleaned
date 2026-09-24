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
          content: `You are the Lead MarTech Strategist at MartechMag (martechmag.com). 
Your task is to answer the user's explicit question directly, concisely, and accurately based ONLY on the provided context.

CRITICAL RULES:
1. DIRECT ANSWER FIRST: Address the exact concept the user is asking about immediately. Do not pivot into a generic summary.
2. BE BRIEF: Keep the response to 1 or 2 tight paragraphs maximum.
3. EDITORIAL STYLE: Professional, sharp, no markdown tables, no excessive bolding.
4. LANGUAGE: 100% professional English.`
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