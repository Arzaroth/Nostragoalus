# Tamper-evidence

Cryptographic proof that score predictions are not edited after kickoff. This is
phase 1 of the ROADMAP "Tamper-evident / E2EE scores" item: a commit-reveal,
in-database hash chain. It covers SCORE predictions only; champion and
best-scorer picks are deferred to a later phase.

[League modes](league-modes.md) add a **separate, parallel chain** for per-league
override picks (`league_prediction_commitment`, head id `league`): same mechanics
below, domain-separated and binding the leagueId
(`appendLeaguePredictionCommitment` / `verifyLeagueChainServer`). The public
`/verify` page still covers only the base chain for now.

## How it works

Every real score-pick change appends an immutable row to `prediction_commitment`,
an append-only ledger with NO foreign keys (so it outlives deleted prediction
rows). Each row is hash-chained: its `entryHash` folds in the prior head, giving
the chain a blockchain shape (tampering means rewriting every later entry, with
no proof-of-work or consensus). A singleton `commitment_chain_head` row is seeded
with `onConflictDoNothing` and locked `FOR UPDATE` on append, so the chain cannot
fork even at genesis (this fixed a cold-start race where two first-ever saves both
claimed seq 1).

Privacy is built in:

- The commitment binds `subject = sha256(userId)`, never the raw id, so the
  public reveal proves integrity without deanonymizing private profiles.
- A 256-bit salt hides the actual pick while the commitment is public; the
  opening (score + salt) is revealed only once the match kicks off.
- A row is appended only when the score actually changes (the autosave de-dupes).

## Code + public surface

- `apps/web-nuxt/shared/commitment.ts` - isomorphic Web-Crypto helpers (sha256, `verifyLedger`,
  `witnessExtension`), used identically on server and client.
- `apps/web-nuxt/server/utils/commitment/service.ts` - append / get-head / get-chain / verify,
  wired into `upsertPrediction` (which now runs in a transaction).
- `GET /api/commitments` and `GET /api/commitments/head` - public,
  unauthenticated.
- The `/verify` page pulls the ledger and recomputes the chain client-side
  (linked from the footer). Strings are i18n'd under `verify.*`.

## Distributed witnessing

Each browser pins the highest head it has verified into localStorage
(`ng-tamper-pin`, never sent to the server) and, on load, fetches only the
extension since its pin to prove the chain still extends it - a Certificate-
Transparency-style consistency proof (`witnessExtension`). The `useTamperWatch`
composable plus the `tamper-watch.client.ts` plugin run the check; a tamper or
rollback verdict surfaces as a `/verify` panel and a site-wide footer warning
chip.

## Scope + residual gaps

Shipped in v1.33.0. Locked decisions: in-DB anchor only (an external anchor like
OpenTimestamps is deferred), scores only. Known residual gaps tracked in TODO:
split-view / equivocation (serving fork A to one user and fork B to another is
not caught by per-device localStorage; it needs cross-client head gossip), and a
raw `prediction`-table edit bypassing the ledger (the ledger is not yet bound to
the live prediction row).

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`prediction_commitment`, `commitment_chain_head`)
- `apps/web-nuxt/shared/commitment.ts`, `apps/web-nuxt/server/utils/commitment/service.ts`
- `apps/web-nuxt/server/api/commitments/*`, `apps/web-nuxt/server/routes/verify/*`,
  `apps/web-nuxt/app/plugins/tamper-watch.client.ts`, `apps/web-nuxt/app/composables/useTamperWatch.ts`
