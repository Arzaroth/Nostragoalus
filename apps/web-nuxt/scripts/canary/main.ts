#!/usr/bin/env node
/**
 * The canary: have the match feeds changed shape under us?
 *
 *   pnpm -C apps/web-nuxt canary
 *   pnpm -C apps/web-nuxt canary --sources espn,uefa
 *   pnpm -C apps/web-nuxt canary --sources=espn
 *
 * Every provider in server/utils/providers/ reads a public but UNDOCUMENTED
 * feed. Nobody will tell us the day ESPN renames `scoringPlay` or FIFA moves
 * `IdGroup`: the adapters are written defensively, so nothing throws - they just
 * quietly stop producing a goal, a group letter, a kickoff time. A silent
 * failure, the worst kind.
 *
 * The unit tests in server/utils/providers/*.test.ts build their own payloads.
 * Perfect for the parsing logic, blind to this drift by construction, since we
 * are the ones writing the bytes. Hence this program: the only one in the repo
 * that really talks to the network, and therefore never run by ordinary CI (see
 * .github/workflows/canary.yml, daily, and ci.yml, offline and deterministic).
 *
 * Exit codes: 0 all well, 1 the canary itself is broken, 2 a source could not be
 * reached, 3 a key is gone or changed type, 64 a bad argument. 1 is our own
 * breakage rather than drift because an unhandled throw already exits 1, and the
 * workflow must never file our bug as a feed change. The full report prints
 * whatever happens - the point is the list of damage, not its first line.
 */

import { parseArgs, USAGE_ERROR } from './cli'
import { allSources, run } from './run'

const all = allSources()
const parsed = parseArgs(
  process.argv.slice(2),
  all.map((source) => source.name),
)

if (parsed.error) {
  console.error(parsed.error)
  // Not 1, 2 or 3: a mistyped argument is the operator's mistake, not the
  // feed's, and it must not be filed as drift nor pass for a green run.
  process.exit(USAGE_ERROR)
}

const chosen = parsed.names
const sources = chosen ? all.filter((source) => chosen.includes(source.name)) : all

process.exit(await run({ sources }))
