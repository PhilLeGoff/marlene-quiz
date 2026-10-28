# Verification record

- TypeScript source check: passed.
- 36 engine tests + 5 database integration tests + 3 administrator-authentication tests: passed (44 total).
- Database integration uses real SQLite migrations and triggers, including immutable score events, session persistence, competing winners and a 32-phone concurrent join burst.
- Full browser game against the compiled Cloudflare Worker: passed through all 19 seeded rounds using independent host, Marlène, two guest and projector browser sessions.
- Actual pointer drawing, private drawing storage/retrieval, anonymous voting, duplicate vote rejection, reconnect, hidden answer keys and concurrent first-correct requests: passed.
- Mobile guest joined in under 15 seconds in the automated scenario.
- Automated WCAG 2 A/AA and 2.1 AA checks on the four public entry points: no violations.
- Responsive checks at 375×812, 812×375, 768×1024 and 1440×1000: no horizontal overflow, join card inside viewport.
- Native dialog, visible labels and reduced-motion preference: checked.
- Production builds: both Vinext/Cloudflare and standard Next.js/webpack passed.
- Client assets inspected for the seeded song answer keys: none found.

Supabase migration/RLS tests are provided but were not executed against an external Supabase project because no credentials/project were supplied. Vercel's production build was verified locally, not deployed to a Vercel account. A real-device network/audio rehearsal and human screen-reader check remain operator checks; automated accessibility checks do not establish complete WCAG conformance.

Local E2E names, audio tone and test image are fixtures, not personal facts about Marlène and not deployed runtime data. The hosted party is initialized separately on first name entry with the original unconfirmed seed bank.

Guest/Marlène entry is name-only; host/admin entry additionally verifies its server-configured password. Room-code entry is removed for people joining. Tests cover concurrent duplicate names, cross-role collisions, same-browser reconnect and release on sign-out.

Admin password: tested missing/incorrect password rejection, invalidation of legacy name-only sessions, identity-preserving reauthentication, and guest/Marlène sessions without passwords.
