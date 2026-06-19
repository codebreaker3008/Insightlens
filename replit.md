# InsightLens

A product intelligence platform that analyzes customer feedback from Reddit and the Google Play Store, clusters it, and produces an evidence-backed AI report for any product or company.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/signalos run dev` — run the frontend (port 19427, proxied at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENROUTER_API_KEY` — OpenRouter API key for AI analysis

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, TailwindCSS, shadcn/ui, Recharts, React Query, wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- AI: OpenRouter (DeepSeek V3 → Qwen3 Max → Llama 3.3 70B → Gemini 2.5 Flash fallback chain)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `lib/db/src/schema/reports.ts` — DB schema for the reports table
- `artifacts/api-server/src/lib/` — data collection: `reddit.ts`, `playstore.ts`, `cluster.ts`, `analyzer.ts`, `openrouter.ts`
- `artifacts/api-server/src/routes/reports/index.ts` — all report API endpoints
- `artifacts/signalos/src/pages/` — frontend pages: `home.tsx`, `report.tsx`

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → type-safe hooks and Zod validation on both client and server.
- 24-hour report caching in Postgres: `queryNormalized` (lowercased) is the cache key, so "Spotify" and "spotify" hit the same cache.
- AI fallback chain: primary model is DeepSeek V3; if it fails, tries Qwen3 Max → Llama 3.3 70B → Gemini 2.5 Flash.
- Reddit uses the public JSON API (no OAuth needed); Play Store uses `google-play-scraper`.
- Data is deduped and clustered before sending to the AI to reduce token usage and improve signal quality.

## Product

Users type any product name (e.g. "Spotify", "Uber", "Notion"). The app:
1. Fetches Reddit posts/comments and Play Store reviews in parallel
2. Deduplicates, clusters, and summarizes the raw feedback
3. Sends the summary to OpenRouter AI with a structured analysis prompt
4. Returns a 10-section product intelligence report: executive summary, sentiment breakdown, top complaints, customer praise, feature requests, competitor mentions, frustrations, opportunities, recommendations, and AI verdict

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Play Scraper sort enum has `HELPFULNESS` at runtime but TypeScript types may be stale — use numeric `1` with a cast.
- `pnpm run typecheck:libs` must be run after changing any `lib/*` package before leaf artifacts can pick up the new exports.
- Do not call `pnpm dev` at workspace root — use workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
