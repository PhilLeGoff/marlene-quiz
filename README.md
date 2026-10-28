# La fête de Marlène 🎂

A working French multiplayer birthday party game: 19 seeded rounds, guests joining by name, a host control room, Marlène’s private dashboard and a separate projector. Built with React 19, TypeScript, App Router, Tailwind 4 and Vinext. Fonts are self-hosted Fredoka and Nunito; illustrations are original SVG.

## Run locally

Requires Node 22.13+ (Node 26 used for verification) and npm.

```sh
npm ci
npm run build
npm run db:local
npm run dev -- --host 127.0.0.1 --port 3005
```

Open `http://127.0.0.1:3005/` and enter a name. No email, password, installation key or room code is required. The first successful entry creates the party and seeds the original question bank atomically. Existing parties are preserved.

All roles enter by name: `/` for guests, `/admin` for the host and `/marlene` for Marlène. Anyone can choose those role pages; the selected role determines the available controls. Names are unique across roles, ignoring accents, casing and repeated spaces. A duplicate name from another browser is refused. The same browser retains its opaque HttpOnly session and can reconnect. Signing out releases that identity's name. Host/star identities are not added to the guest leaderboard unless they also join as a guest.

The room code remains visible for identifying the projector and generating invitation links, but is not required to join the game.

- `/admin`: question editor, ordering, media uploads, game controls, participation, moderation, manual grading and immutable score adjustments.
- `/marlene`: separate login, private answers, drawing prompt, live Pictionary, anonymous final vote and sensitive-round consent.
- `/play`: guest lobby, all answer types, touch drawing, results and rankings.
- `/present?room=123456`: read-only large-screen view and join QR code. The host supplies the room code.

## Before the party

1. In **Les manches**, confirm the unknown answer keys with Marlène. Only the outfit combination and the three blind-test song/artist keys were supplied as confirmed. The other choices are not treated as known facts.
2. Additional child-name distractors Gaspard and Colette are clearly marked as generated and editable. All original supplied options are retained, including both seven-choice questions.
3. Upload legally supplied audio excerpts for each blind-test round. Set start/end seconds and test the projector’s audio. Browsers may require an initial tap on Play; the projector explains this when autoplay is blocked. Uploaded filenames are replaced with random IDs so a filename cannot reveal the song.
4. Numerical values, including height and screen time, are entered privately. Screen time defaults to average daily minutes over the last seven days; change the period/unit in the editor as needed.
5. The optional PIN uses an invented game-only code of 4–8 digits. Never enter an actual device credential. The photo round starts empty and disabled: upload only authorized images and configure their matching options/keys. No real ex-partner identities are included.
6. The intimate round is disabled. Only Marlène can explicitly consent and supply its private answer. The host can then enable it. Skipping incurs no penalty. Withdrawal immediately removes its secret and submissions. The app also erases them on advancing, finishing, resetting, or expiry after two hours (on the next authenticated/API read or mutation; there is no background retention cron).
7. Try a short rehearsal on the actual Wi-Fi and projector. Use **Réglages → Nouvelle partie** to reset scores while retaining questions and connected players.

## Game behavior

The host progresses through lobby → question open → closed → reveal → leaderboard → next round → finished. Drawing adds collection and anonymous voting; Pictionary adds waiting, live drawing and first-winner phases. Server time determines the deadline. Late guesses are rejected even if a disconnected device still displays an open screen. The host closes and advances the visible phase.

Standard scoring: correct +1, incorrect −1, unanswered 0; totals may be negative. Multiple-choice sets must match exactly. Numeric tolerance is configurable. Free-text normalization removes case, accents, punctuation and spaces; aliases are explicit. Personal/ambiguous reveal answers require host validation, never AI judgment. Drawing winner and first correct Pictionary guess receive +5. Pictionary losers are not penalized. Creative winner scoring is configurable (including zero).

Every normal score has a unique round/player event ID. Retries cannot award it again. Manual grading is also once per round/player. Corrections create new adjustment events with a reason. SQL triggers reject editing/deleting the audit log or removing earlier events from state. Ranking uses score, correct-answer count, then cumulative correct response time; remaining ties share rank.

Drawings support pointer/touch/stylus, colors, size, eraser, undo and clear. Canvas strokes use normalized vector coordinates. Submitted drawings are stored privately in R2 or Supabase Storage, with access checked against role, owner and phase. The gallery removes names until the final vote. Pictionary streams small vector segments, with cursor-based incremental reads and periodic full repair after undo/reconnect. Phones support tap-based outfit selection as an accessible alternative to dragging. Drawing itself is an inherently spatial activity; the rest of the interface is keyboard operable.

## Storage and synchronization

**Default Sites/Cloudflare:** D1 persists the party aggregate, sessions and immutable score audit; R2 persists media and submitted drawings. `.openai/hosting.json` declares the provisioned bindings. D1 compare-and-swap serializes all mutations; a stale request reloads and retries the reducer. Ordinary screens refresh at 1.6 seconds and live drawing at approximately 280ms. This default uses bounded polling rather than a push subscription.

**Optional Supabase:** configure all three server runtime variables in `.env.example` and apply `supabase/migrations/202610280001_party.sql`. The same engine uses a PostgreSQL transactional CAS RPC, private Storage bucket and Supabase Realtime revision notifications. Only the `party_revisions` table is publicly readable and published: it contains IDs and version numbers, never keys, drawings, sessions, submissions or scores. Each notification fetches a newly authorized view; polling remains a reconnect fallback. Never publish `parties` to Realtime. All other tables have RLS enabled and browser grants revoked. Only the server has the service role key.

There is intentionally one party per deployment. The aggregate approach is designed for a birthday-sized room (a modest guest list), not an unbounded public game service. A very large history should be archived between events. Uploaded orphan files from aborted requests are private; operators can remove them in R2/Storage after the event. Reset preserves immutable scoring history and starts a new scoring generation.

## Security

No game passwords are used. Random opaque session tokens are hashed in persistent server state. Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Name reservation is checked inside the atomic CAS transaction, so simultaneous requests for the same name yield one success and one duplicate-name response. Existing password hashes are cleared when the updated entry flow is used. Every game mutation continues to validate session, selected role, phase, timing and input. Roles are self-selected through their entry pages; this party flow intentionally does not verify a person's real-world identity.

Requests retain origin checks, bounded payloads, rate limits and idempotency IDs. Answer keys, media and submissions are still filtered by role and phase. Browser access to the database stays restricted by RLS. The published Site is shared publicly by link so guests do not encounter a hosting-account sign-in gate.

## Deploy

### Sites

The checked-in manifest identifies this Site. Use the Sites plugin’s source/build/package/deploy workflow; the platform applies the schema migrations and provisions D1/R2. Do not push local `.wrangler`, `.env`, `.dev.vars`, sessions or test databases. Initial party data is created when the first person enters a name on the deployed instance. Local test answers are never deployed.

### Vercel + Supabase

1. Apply the Supabase migration using the SQL editor or `supabase db push`. Enable Realtime for the included revision table (the migration adds it to the standard publication). The `party-media` bucket stays private, without browser upload/read policies.
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Keep the service role key server-only.
3. Set the build command to `npm run build:vercel`; the Worker entrypoint injects request-scoped Cloudflare bindings, while standard Next.js reads server environment variables. For a local Next build use `npm run build:vercel`. Standard output is `.next`; use `npm run start:vercel` to run it.
4. Open `/admin`, enter your name, then share the party link. No installation password or key is required.

Both the Cloudflare/Sites and standard Next.js production builds are verified locally. A live Supabase project and Vercel account were not provided; those external services require configuration and a deployment smoke test before use.

## Verification

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
```

E2E starts its own compiled Worker on port 3105 and initializes the isolated `.wrangler/e2e-state` database and storage. It never reuses or modifies the normal preview on port 3005. Run `npm run build` first, then `npm run test:e2e`. Explicit external test targets require both `TEST_BASE_URL` and `TEST_ALLOW_EXTERNAL_MUTATIONS=1`; never target a real party. The complete-game test walks all 19 rounds with independent role sessions and checks drawing, scoring and first-winner races. Test media is an original sine tone and a one-pixel authorized fixture. Browser tests also cover name-only entry, duplicate-name races, reconnect, logout, responsive behavior and accessibility. Supabase RLS checks remain available under `supabase/tests` for a configured Supabase environment.

The seed is in `lib/game/seed.ts`; the server-only name entry writes it atomically to whichever database is selected. `npm run seed:export` exports the bank to `db/seed.json` for review; it does not create a live party.
