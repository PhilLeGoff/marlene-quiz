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

Open `http://127.0.0.1:3005/` and enter a name. Guests need no email, password, installation key or room code. The first successful entry creates the party and seeds the original question bank atomically. Existing parties are preserved.

Guests enter their name on `/`. Marlène opens `/marlene` (or types her name on `/`, in any spelling such as `marlene` or `MARLÈNE`, and is sent there) and enters the four-digit VIP PIN `1234` using the round phone keypad or keyboard; no username is required. There is one VIP identity, named Marlène, reserved from guest registration: any spelling of her name, ignoring accents, casing, spaces, punctuation and emoji, leads to the PIN pad instead of a guest seat. Signing in on another device replaces the previous VIP session. The host enters a name and the administrator password on `/admin`. Set that password in the server-only `ADMIN_PASSWORD` environment variable. Names are unique across roles, ignoring accents, casing and repeated spaces. A duplicate name from another browser is refused. The same browser retains its opaque HttpOnly session and can reconnect. Signing out releases that identity's name. For local Cloudflare development place `ADMIN_PASSWORD` in an ignored `.dev.vars`; standard Next.js uses ignored `.env.local`. Host/star identities are not added to the guest leaderboard unless they also join as a guest.

No room code is displayed or requested. `/present` connects directly to the current party; the join QR code opens the homepage.

- `/admin`: question editor, ordering, media uploads, game controls, participation, moderation, manual grading and immutable score adjustments.
- `/marlene`: separate login, private answers, drawing prompt, live Pictionary, anonymous final vote and sensitive-round consent.
- `/play`: guest lobby, all answer types, touch drawing, results and rankings.
- `/present`: read-only large-screen view and join QR code. No code is needed.

## Before the party

1. In **Les manches**, review the supplied, prefilled answers for children’s names, countries, the balcony, Nutsy, blind tests, outfit, dream job and red flag. Confirm the remaining unknown answers with Marlène; no unknown personal facts are invented.
2. Additional child-name distractors Gaspard and Colette are clearly marked as generated and editable. All original supplied options are retained, including both seven-choice questions.
3. Upload legally supplied audio excerpts for each blind-test round. Set start/end seconds and test the projector’s audio. Browsers may require an initial tap on Play; the projector explains this when autoplay is blocked. Uploaded filenames are replaced with random IDs so a filename cannot reveal the song.
4. Numerical values, including height and screen time, are entered privately. Screen time defaults to average daily minutes over the last seven days; change the period/unit in the editor as needed.
5. Marlène's VIP PIN defaults to `1234`. The host can change it in **Réglages → Code VIP de Marlène** (exactly four digits); the current code is never shown in any view. Changing it signs Marlène out of every device. Never enter an actual device credential. The photo round starts empty and disabled: upload only authorized images and configure their matching options/keys. No real ex-partner identities are included.
6. The intimate round is disabled. Only Marlène can explicitly consent and supply its private answer. The host can then enable it. Skipping incurs no penalty. Withdrawal immediately removes its secret and submissions. The app also erases them on advancing, finishing, resetting, or expiry after two hours (on the next authenticated/API read or mutation; there is no background retention cron).
7. Try a short rehearsal on the actual Wi-Fi and projector. Use **Réglages → Nouvelle partie** to reset scores while retaining questions and connected players.

## Game behavior

The host progresses through lobby → question open → closed → reveal → leaderboard → next round → finished. Drawing adds collection and anonymous voting; Pictionary adds waiting, live drawing and first-winner phases. Server time determines the deadline. Late guesses are rejected even if a disconnected device still displays an open screen. The host closes and advances the visible phase.

The floating **Arrêter le quiz** button is available to the host across every dashboard tab and every unfinished game phase. Confirmation immediately ends submissions, drawing, audio and timers, then shows the current final standings on all connected screens. Previously awarded points are retained; pending answers are not scored and unrevealed answers are not disclosed. The adjacent **Recommencer** button is always available, including after a game finishes. After confirmation, it returns everyone to the lobby, zeros scores and ranking tie-breaks, clears submissions/drawings/winners/timers/audio/reveal permissions, and resets sensitive consent. Players stay connected and questions, uploads and saved non-sensitive answer keys are retained. Earlier score events remain in the immutable audit archive but are excluded from the new game's scores and visible points ledger.

Standard scoring: correct +1, incorrect −1, unanswered 0; totals may be negative. Multi-select rounds score each ticked option: +1 if right, −1 if wrong, unticked options 0. Numeric tolerance is configurable. Slider rounds (Marlène's height) score 5 for the exact value and 1 less per cm off, going negative. Free-text normalization removes case, accents, punctuation and spaces; aliases are explicit. Personal/ambiguous reveal answers require host validation, never AI judgment. Drawing winner and first correct Pictionary guess receive +5. Pictionary losers are not penalized. Creative winner scoring is configurable (including zero).

Every normal score has a unique round/player event ID. Retries cannot award it again. Manual grading is also once per round/player. Corrections create new adjustment events with a reason. SQL triggers reject editing/deleting the audit log or removing earlier events from state. Ranking uses score, correct-answer count, then cumulative correct response time; remaining ties share rank.

Drawings support pointer/touch/stylus, colors, size, eraser, undo and clear. Canvas strokes use normalized vector coordinates. Submitted drawings are stored privately in R2 or Supabase Storage, with access checked against role, owner and phase. The gallery removes names until the final vote. Pictionary streams small vector segments, with cursor-based incremental reads and periodic full repair after undo/reconnect. Phones support tap-based outfit selection as an accessible alternative to dragging. Drawing itself is an inherently spatial activity; the rest of the interface is keyboard operable.

## Storage and synchronization

**Default Sites/Cloudflare:** D1 persists the party aggregate, sessions and immutable score audit; R2 persists media and submitted drawings. `.openai/hosting.json` declares the provisioned bindings. D1 compare-and-swap serializes all mutations; a stale request reloads and retries the reducer. Ordinary screens refresh at 1.6 seconds and live drawing at approximately 280ms. This default uses bounded polling rather than a push subscription.

**Optional Supabase:** configure all three server runtime variables in `.env.example` and apply `supabase/migrations/202610280001_party.sql`. The same engine uses a PostgreSQL transactional CAS RPC, private Storage bucket and Supabase Realtime revision notifications. Only the `party_revisions` table is publicly readable and published: it contains IDs and version numbers, never keys, drawings, sessions, submissions or scores. Each notification fetches a newly authorized view; polling remains a reconnect fallback. Never publish `parties` to Realtime. All other tables have RLS enabled and browser grants revoked. Only the server has the service role key.

There is intentionally one party per deployment. The aggregate approach is designed for a birthday-sized room (a modest guest list), not an unbounded public game service. A very large history should be archived between events. Uploaded orphan files from aborted requests are private; operators can remove them in R2/Storage after the event. Reset preserves immutable scoring history and starts a new scoring generation.

## Security

The host/admin role requires a password, supplied by the server-only `ADMIN_PASSWORD` variable. Guests remain name-only. Marlène requires the six-digit PIN, checked on the server with a rate limit of 12 login attempts per minute per IP. Old name-only VIP sessions are invalidated; only the single VIP identity can receive a PIN-authenticated session. Random opaque session tokens are hashed in persistent server state. Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Name reservation is checked inside the atomic CAS transaction, so simultaneous requests for the same name yield one success and one duplicate-name response. Old name-only administrator sessions must authenticate with the password again; their reserved name and participant identity are preserved. Every game mutation continues to validate session, selected role, phase, timing and input. VIP sessions include a server-verified PIN proof. The PIN answer remains hidden from guests before reveal, and exact digit matching is required for the bonus. Because VIP login and the bonus deliberately share a code, players who learn the bonus answer can also use it to sign in as Marlène; the PIN must not be treated as a separate confidential credential after that reveal. Administrator sessions include a server-verified password proof; changing `ADMIN_PASSWORD` invalidates earlier admin sessions.

Requests retain origin checks, bounded payloads, rate limits and idempotency IDs. Answer keys, media and submissions are still filtered by role and phase. Browser access to the database stays restricted by RLS. The published Site is shared publicly by link so guests do not encounter a hosting-account sign-in gate.

## Deploy

### Sites

The checked-in manifest identifies this Site. Use the Sites plugin’s source/build/package/deploy workflow; the platform applies the schema migrations and provisions D1/R2. Do not push local `.wrangler`, `.env`, `.dev.vars`, sessions or test databases. Initial party data is created when the first person enters a name on the deployed instance. Local test answers are never deployed.

### Vercel + Supabase

1. Apply the Supabase migration using the SQL editor or `supabase db push`. Enable Realtime for the included revision table (the migration adds it to the standard publication). The `party-media` bucket stays private, without browser upload/read policies.
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` in Vercel. Keep the service role key server-only.
3. Set the build command to `npm run build:vercel`; the Worker entrypoint injects request-scoped Cloudflare bindings, while standard Next.js reads server environment variables. For a local Next build use `npm run build:vercel`. Standard output is `.next`; use `npm run start:vercel` to run it.
4. Set `ADMIN_PASSWORD`, open `/admin`, enter your name and that password, then share the party link. Guests enter by name; Marlène enters her six-digit PIN on `/marlene`.

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

Prepared answers remain private, are reused automatically and survive a new-party reset (except the optional sensitive answer, which is deliberately erased). Their forms collapse into an “already saved” summary with an edit action. Unknown personal answers are not guessed.

## Préparation des réponses — notes fournies le 29 octobre 2026

Les réponses suivantes sont préremplies et confirmées : Philippe **et** Simone ; France, Canada, Indonésie et Australie ; pipi **et** saut du balcon en culotte ; Nutsy = son cheval ; les trois chansons du blind test ; chaussettes + short + t-shirt ; métier de rêve = prof de plongée ; red flag = cotons-tiges usagés gardés dans une boîte. Les choix contiennent aussi des propositions pièges modifiables. Le blind test propose des cartes de réponses et nécessite toujours des extraits autorisés fournis par l’hôte.

La mise à jour est appliquée une seule fois aux parties existantes, en conservant les joueurs, scores, médias et chronos. Une manche déjà ouverte/révélée n’est pas modifiée pendant son déroulement. Les modifications manuelles ultérieures sont conservées. Les valeurs absentes des notes (taille, temps d’écran, réponse au million…) restent à fournir une fois. Le défi créatif ne demande aucune bonne réponse personnelle. La manche intime reste facultative et désactivée sans consentement.

À la demande de l’utilisateur, les modifications de cette mise à jour sont publiées sans exécution des tests, du lint ou d’un second build Next.js. Seule la compilation nécessaire au site hébergé est effectuée.
