# Motor SEO/AEO — PRD

## Original problem
The user asked for an analysis of babylovegrowth.ai (an AI SEO tool), then approved building their own, better tool: a Spanish SEO/AEO content engine that runs only on the user's own API keys (BYOK). It covers BabyLoveGrowth's features except the backlink network and adds differentiators. Built in 3 phases.

## Architecture
- Backend: FastAPI (server.py + routes_main, routes_articles, routes_public, routes_insights, publisher, content, llm, core). MongoDB (string uuid ids, ISO dates). GridFS for AI images. APScheduler: scheduled publishing (2 min), autopilot (15 min), AI-visibility cron (1 h).
- LLM: emergentintegrations LlmChat called with the USER's keys (encrypted in db.api_keys with Fernet). Models: claude-sonnet-5-5, gpt-5.6-terra, gemini-3.1-pro-preview, perplexity sonar. Images: OpenAI gpt-image-1 or Gemini. Voice notes: OpenAI whisper-1. Email: Resend (user key).
- Frontend: React + shadcn, dark "newsroom" theme (Outfit / Plus Jakarta / Playfair). JWT admin login (Bearer).

## Phase 1 — DONE (2026-10-13)
- Admin login, encrypted BYOK keys with masking and connection test
- Projects, automatic brand analysis, catalog, CTA, authors, monthly AI budget
- 30-day plan ranked by purchase intent, comparison/alternatives pages, cluster map
- Live writing over SSE + interview mode (text and voice), metadata, FAQ, key points, JSON-LD, sensitive-topic check, 0–100 score with breakdown
- Editor: preview/markdown/FAQ, section regeneration, fact-check with approval gate, AI images, repurposing (5 formats), retroactive internal links, publish/schedule/unpublish
- Widget JS (grid/list, color, lead form, tracking), public API, RSS, sitemap, llms.txt, crawlable SSR pages, canonical URL pattern
- Native WordPress (app password) and Shopify (Admin token) publishing, with connection test
- Cadence + autopilot (review required by default)
- Stats (views, product/CTA clicks, CTR, leads), leads inbox + Resend email alert
- AI visibility tracking (GPT/Claude/Gemini/Perplexity), technical audit, AI costs page
- Tested: backend 35/35; frontend all pages; live writing verified in the UI

## Backlog
- P0 Phase 2: accounts and roles (admin/agency/client), agency workspaces, white label, Stripe plans, monthly reports, Search Console, DataForSEO, competitor gaps, programmatic SEO, decay detection + refresh, translation/hreflang, A/B tests, revenue attribution, copilot, weekly digest
- P1 Phase 3: Instagram/Facebook carousels, Reddit/Quora assistant, on-site sales assistant, PDF lead magnets, audio version
