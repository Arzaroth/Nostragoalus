#!/usr/bin/env node
/**
 * The canary: have the match feeds changed shape under us?
 *
 *   pnpm -C apps/web-nuxt canary
 *   pnpm -C apps/web-nuxt canary --sources espn,uefa
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
 * Exit codes: 0 all well, 1 a key is gone or changed type, 2 a source could not
 * be reached. The full report prints either way - the point is the list of
 * damage, not the first line of it.
 */

import { allSources, run } from './run'

function wanted(argv: string[]): string[] | null {
  const index = argv.indexOf('--sources')
  const value = index === -1 ? null : argv[index + 1]
  if (!value) return null
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

const names = wanted(process.argv.slice(2))
const sources = names ? allSources().filter((source) => names.includes(source.name)) : allSources()

if (names && sources.length === 0) {
  console.error(`no such source: ${names.join(', ')} (known: ${allSources().map((s) => s.name).join(', ')})`)
  // Not 1: a mistyped argument is the operator's, not the feed's, and it must
  // not be filed as drift - nor pass for a green run.
  process.exit(64)
}

process.exit(await run({ sources }))
