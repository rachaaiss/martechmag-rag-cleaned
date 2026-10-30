# 🧪 MartechMag RAG - Personal Lab Experiment - English Version

This project is simply an **internal testing prototype** built in my personal lab (MartechMag). The goal was to quickly visualize what a lightweight RAG assistant connected to my articles and Lab Reports would look like end-to-end, without over-engineering it.

### 💡 Key Context:
* **Kept simple on purpose:** No complex vector databases or heavy embedding pipelines here. It relies on standard PostgreSQL Full-Text Search (via Supabase) to query simple text documents.
* **Pragmatic Security:** Since all articles are already 100% public on the website, there's no need for complex data access restriction. Basic rate-limiting is included just to protect the Groq LLM API from cost spikes.
* **Rapid Prototyping:** Built as a hands-on experiment to test low-latency inference (`gpt-oss-20b` on Groq), prompt constraints, and UI design.

If this repository or code can help you or serve as a starting point for your own experiments, **feel free to use it!** 🚀


# 🧪 MartechMag RAG - Labo d'expérimentation - Version Française

Ce projet est simplement un **prototype de test interne** créé dans mon labo perso (MartechMag). L'objectif était de voir concrètement à quoi ressemblerait un petit assistant RAG connecté à mes articles et Lab Reports, de bout en bout, sans sur-ingénierie.

### 💡 À garder en tête :
* **Un RAG volontairement simple :** Pas besoin d'embeddings complexes ou de bases vectorielles lourdes ici. C'est de la recherche plein texte (Full-Text Search) directe dans PostgreSQL (Supabase) pour interroger du texte simple.
* **Sécurité minimale et pragmatique :** Comme les articles sont déjà 100 % publics sur le site, l'accès n'a pas besoin d'être verrouillé. Un simple rate-limiting est là pour éviter les abus de coût sur l'API Groq.
* **Prototypage & Vibe Coding :** C'est un outil pour tester la latence, le comportement du LLM (`gpt-oss-20b` sur Groq) et le rendu UI.

Si ce code ou cette structure peut vous servir de base ou vous inspirer pour vos propres tests, **servez-vous avec plaisir !** 🚀
