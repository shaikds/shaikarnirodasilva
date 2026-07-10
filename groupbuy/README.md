# GroupBuy AI 🤝

An AI-managed group-buying platform. An autonomous agent finds deal opportunities from real member demand, verifies that supplier discounts are **genuinely fair for your location**, opens buying groups, manages them, and closes deals by handing every member a real coupon code for the supplier's own website. The platform never touches money.

**Hebrew-first (RTL) + English · Israel-first market · Ollama-friendly (private, local LLM)**

## How it works

1. **Suppliers onboard** — list products with a *list price*, a *floor price* (the minimum they accept), a max discount, and upload a pool of real coupon codes for their site.
2. **Members vote** on products they want ("I want this").
3. **The AI agent cycle** runs (admin button or cron):
   - aggregates demand signals,
   - **verifies fairness** — the discount is measured against `min(claimed price, 90-day minimum historical price, market reference price)`, so inflating the "regular price" or hiking it before a deal is detected and **blocked**, and the supplier's trust score drops,
   - **computes a win-win price** deterministically: never below the supplier's floor, always a real verified discount, deeper in lower purchasing-power countries (PPP-adjusted),
   - an LLM ranks the surviving opportunities and writes the buyer-facing rationale (nothing more — see guardrails),
   - opens groups, expires stale ones, and closes full ones by assigning one coupon code per member.
4. **Members redeem** their code directly on the supplier's website.

### Trending items (default section on the landing page)

A weekly scraper pulls what's actually trending in Israel — KSP bestsellers (electronics) and Super-Pharm bestsellers (beauty/household) — and price-checks every item against **Zap's verified lowest Israeli price**, which becomes the fairness bar. Members vote; once votes cross a **deterministic win-win threshold** (the smallest group size at which the pricing engine can beat that market price with a real, PPP-adjusted discount above a plausible floor), verified suppliers compete to fulfil it: they bid a floor price + stock and must commit to **free shipping**. The agent scores every bid with the same pricing engine and picks whichever yields members the lowest price — ties go to the higher-trust supplier. The winner never sets the price; the engine's number, anchored to Zap, is final. The item then becomes a real `Product` (with the votes converted into demand signals) and flows through the same guardrailed pipeline once coupons are uploaded.

Scraping runs on the deterministic mock provider by default (dev/CI); set `FIRECRAWL_API_KEY` to scrape live (KSP via its own JSON API, Super-Pharm/Zap via Firecrawl, since both sit behind bot protection).

## AI safety & security design

| Layer | Guarantee |
|---|---|
| Deterministic engines | Prices, fairness, and all limits are pure code. The LLM cannot set a price, bypass a check, or see the guardrail layer. |
| Guardrails (audited) | Kill switch (re-read before every action), per-cycle action caps, supplier verification + trust threshold + per-supplier deal caps, price-floor re-check, minimum real discount, coupon-pool/stock sufficiency. Every decision (allowed or blocked, with reason codes) is stored in an audit trail visible in the admin UI. |
| Prompt-injection defenses | Supplier text is fenced as untrusted, delimiter-stripped, length-capped; LLM output is schema-validated; hallucinated product refs are dropped; a failing/hostile model degrades to the deterministic mock — it can't take the pipeline down. |
| Privacy | No PII is ever sent to any LLM (the prompt input type has no user fields). Default provider is **Ollama on your own machine**. |
| App security | Auth.js v5 (bcrypt, rate-limited login, no account enumeration), RBAC chokepoint (`requireUser`), object-level authorization, zod validation on every input, CSP + security headers, Prisma parameterized queries. |
| Evaluations | 5-category eval suite (fake-discount detection, pricing win-win properties, guardrail compliance, prompt-injection resistance, ranking quality) runs in CI at 100%. |

## Quick start

```bash
cd groupbuy
npm install
docker compose up -d              # Postgres 16
cp .env.example .env              # then set AUTH_SECRET: openssl rand -base64 32
npx prisma migrate dev
npm run seed
npm run dev                       # http://localhost:3000
```

Demo accounts (password `Demo1234!`):

| Role | Email |
|---|---|
| Admin | `admin@groupbuy.local` |
| Member | `dana@groupbuy.local` (also yossi/noa/avi/maya) |
| Supplier (honest) | `supplier@soundwave.co.il` |
| Supplier (scammer, gets blocked) | `supplier@dealking.example` |

Sign in as **admin → ניהול/Admin → Run agent cycle** and watch the audit table: the DealKing product (price hiked 85% three days ago, listed at almost double the market price) is blocked with `LIST_PRICE_INFLATED_VS_MARKET, RECENT_PRICE_HIKE`, while fair deals open.

## Using a real LLM (optional)

The app runs fully on a deterministic mock by default. To use Ollama on your Mac:

```bash
ollama pull gemma3:12b-it-qat
```

Then in `.env`:

```
LLM_PROVIDER="openai-compat"
LLM_BASE_URL="http://localhost:11434/v1"
LLM_MODEL="gemma3:12b-it-qat"
```

Any OpenAI-compatible endpoint works (DeepSeek etc.), but note data leaves your machine on hosted APIs — Ollama is the private option, and no PII is included in prompts either way.

## Commands

```bash
npm test          # 67 unit tests (pricing, fairness, guardrails, prompts, trending)
npm run eval      # AI eval scorecard (mock provider)
EVAL_LIVE=1 npm run eval   # evals against your configured live model
npm run lint && npm run typecheck
npx tsx scripts/smoke-lifecycle.ts   # full open→join→close→kill-switch check
npx tsx scripts/smoke-trending.ts    # scrape→vote→activate→claim→convert→open check
```

## Architecture

```
src/lib/pricing/engine.ts     deterministic PPP win-win pricing
src/lib/fairness/verify.ts    anti-fake-discount verification
src/lib/agent/guardrails.ts   hard limits, kill switch checks
src/lib/agent/cycle.ts        the autonomous agent loop + audit trail
src/lib/llm/                  provider abstraction (mock / Ollama / any OpenAI-compat)
src/lib/scraper/              trending scraper abstraction (mock / Firecrawl)
src/lib/trending/             win-win activation threshold (pure)
src/app/                      Next.js 16 App Router UI (he/en, RTL)
evals/                        golden-set AI evaluations
```

Deploy: any Node host + Postgres (Vercel + Neon/Supabase work out of the box — set `DATABASE_URL`, `AUTH_SECRET`, and optionally the `LLM_*`/`AUTH_GOOGLE_*` vars).
