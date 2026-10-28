# Marlène — implementation plan

1. [x] Bootstrap App Router / TypeScript, persistent D1 with optional Supabase PostgreSQL adapter, shared design tokens.
2. [x] Seed 19 rounds from the 17 supplied notes, keeping unknown answers private and unconfirmed; sensitive/PIN/photo rounds disabled.
3. [x] Server-authoritative reducer, optimistic version compare-and-swap, idempotency, immutable score events, role-filtered views, persistent opaque sessions and rate limits.
4. [x] Guest lobby and every answer renderer; host question editor/control room; crown-themed private Marlène controls; projector.
5. [x] Vector drawing with live incremental delivery, anonymous gallery, final voting and race-safe Pictionary.
6. [x] Authorized media upload/read, clip timing/playback, moderation, explicit sensitive consent and withdrawal, safe reset.
7. [x] Unit/integration/E2E, responsive and accessibility QA, production build.

Publication is performed through the Sites source/package/deploy workflow. The native deployment result is the source of truth for its URL and status.

## Decisions

The supplied App Router stack is retained using Vinext for Cloudflare/Sites deployment. D1 and R2 make the preview work without external accounts. An optional Supabase adapter supplies PostgreSQL CAS transactions, a private Storage bucket and Realtime **revision-only** broadcasts. Clients always fetch a server-filtered view; secret state never enters a public broadcast. Standard Next.js/Vercel deployment uses that adapter.

Trusted UI/UX Pro Max was inspected at `/home/pgoff/.agents/skills/ui-ux-pro-max`, already available, and linked into Codex's skill directory. Its two broad party queries returned generic Swiss/minimal layouts rather than a verified party match; the design therefore follows the user's art direction and the skill's general accessibility/touch guidance. No remote install script was executed.
