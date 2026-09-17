import {
  describeError,
  fetchJson,
  politeLimiter,
  Unreachable,
  UpstreamRejected,
  type CanarySource,
  type SourceResult,
} from './source'
import type { RateLimiter } from '../../server/utils/providers/rate-limiter'
import { Ledger } from './ledger'
import { espnSource } from './sources/espn'
import { fifaSource } from './sources/fifa'
import { uefaSource } from './sources/uefa'
import { worldRugbySource } from './sources/worldrugby'

/**
 * Four outcomes, deliberately distinct.
 *
 * BROKEN is 1 and not something rarer on purpose: an unhandled throw, a missing
 * script, a tsx that will not load - anything that kills the process - already
 * exits 1, so 1 has to mean "the canary itself is in trouble" or the workflow
 * would file our own breakage as a feed change and blame ESPN for it.
 * DRIFT therefore takes its own code.
 */
export const GREEN = 0
export const BROKEN = 1
export const UNREACHABLE = 2
export const DRIFT = 3

/** Grepped by the workflow, so a human-readable report can change freely. */
export const VERDICT_PREFIX = 'canary-verdict:'

export function allSources(): CanarySource[] {
  return [espnSource(), fifaSource(), uefaSource(), worldRugbySource()]
}

export interface RunOptions {
  sources?: CanarySource[]
  now?: Date
  fetchImpl?: typeof fetch
  out?: (line: string) => void
  /** Overridden by the tests, which must not wait a second between stubs. */
  limiter?: RateLimiter
}

export async function visit(source: CanarySource, options: RunOptions = {}): Promise<SourceResult> {
  const notes: string[] = []
  const limiter = options.limiter ?? politeLimiter()
  // Built here, not inside the source: a throw half-way through must still
  // report the keys already established. Discarding it turned a source with ten
  // missing keys and one late 404 into a silent "passing outage".
  const ledger = new Ledger(source.plan)

  const ctx = {
    now: options.now ?? new Date(),
    ledger,
    note: (line: string) => notes.push(line),
    getJson: <T,>(url: string) =>
      fetchJson<T>(url, { headers: source.headers, fetchImpl: options.fetchImpl, limiter }),
  }

  try {
    const problems = await source.visit(ctx)
    return {
      name: source.name,
      status: ledger.failures().length || problems.length ? 'red' : 'green',
      ledger,
      problems,
      notes,
    }
  } catch (error) {
    if (error instanceof UpstreamRejected) {
      // A refused endpoint is drift, not weather.
      return {
        name: source.name,
        status: 'red',
        ledger,
        problems: [`the feed refused a route the app reads: ${error.message}`],
        notes,
        reason: error.message,
      }
    }
    if (error instanceof Unreachable) {
      return { name: source.name, status: 'unreachable', ledger, problems: [], notes, reason: error.message }
    }
    // Our bug, or a payload shape that broke an inspector. Either way it is the
    // canary that needs fixing, and it must not read as a feed change.
    return {
      name: source.name,
      status: 'broken',
      ledger,
      problems: [`the canary itself threw: ${describeError(error)}`],
      notes,
      reason: describeError(error),
    }
  }
}

export async function run(options: RunOptions = {}): Promise<number> {
  const sources = options.sources ?? allSources()
  const out = options.out ?? ((line: string) => console.log(line))
  const results: SourceResult[] = []

  out('canary - have the match feeds changed shape under us?')
  out('')

  for (const source of sources) {
    const result = await visit(source, options)
    results.push(result)
    report(result, out)
  }

  const broken = results.filter((r) => r.status === 'broken')
  const red = results.filter((r) => r.status === 'red')
  const mute = results.filter((r) => r.status === 'unreachable')

  // The summary goes last and names every finding, because the workflow pastes
  // the tail of this file into an issue: a reader must not have to scroll a
  // 300-line key table to learn which key moved.
  if (broken.length || red.length) {
    out('--- what to look at ---')
    for (const result of [...broken, ...red]) {
      for (const key of result.ledger.failures()) out(`  ${result.name}: ${key} (${result.ledger.verdict(key)})`)
      for (const problem of result.problems) out(`  ${result.name}: ${problem}`)
    }
    out('')
  }

  if (broken.length) {
    out(`${VERDICT_PREFIX} broken`)
    out(`BROKEN: the canary itself failed on ${broken.map((r) => r.name).join(', ')}. This is our bug, not the feed's.`)
    return BROKEN
  }

  if (red.length) {
    out(`${VERDICT_PREFIX} drift`)
    out(`RED: the shape moved on ${red.map((r) => r.name).join(', ')}. The code that reads these keys lives`)
    out('     in apps/web-nuxt/server/utils/providers/.')
    return DRIFT
  }

  if (mute.length) {
    out(`${VERDICT_PREFIX} unreachable`)
    out(`SOURCE UNREACHABLE (${mute.map((r) => r.name).join(', ')}): nothing could be verified there.`)
    out('     A passing outage is fixed by running it again.')
    return UNREACHABLE
  }

  out(`${VERDICT_PREFIX} green`)
  out('GREEN: every key the providers read is where they expect it.')
  const blind = results.filter((r) => r.ledger.unchecked().length)
  if (blind.length) {
    out(
      `       (${blind.map((r) => `${r.name}: ${r.ledger.unchecked().length}`).join(', ')} key(s) could not be looked at,`,
    )
    out('       for want of a match or an action to inspect - that is not a failure.)')
  }
  return GREEN
}

/**
 * One line of report, with anything the feed controls made safe to paste.
 *
 * A problem string can carry a sampled value, and that value is remote text: a
 * newline plus a fence would otherwise close the code block in the GitHub issue
 * body and let a hostile upstream render markdown in an issue authored by our
 * own bot.
 */
export function safeLine(text: string, limit = 300): string {
  const flat = text.replace(/[\r\n\t]+/g, ' ').replace(/`/g, "'")
  return flat.length > limit ? `${flat.slice(0, limit)}...` : flat
}

function report(result: SourceResult, out: (line: string) => void): void {
  out(`--- ${result.name} ${'-'.repeat(Math.max(0, 70 - result.name.length))}`)

  for (const note of result.notes) out(`  ${safeLine(note)}`)

  if (result.status === 'unreachable') {
    out(`  ${'UNREACHABLE'.padEnd(10)} ${safeLine(result.reason ?? '')}`)
    out('')
    return
  }

  for (const line of result.ledger.lines()) out(safeLine(line, 400))
  for (const problem of result.problems) out(`  ${'CROSS'.padEnd(10)} ${safeLine(problem)}`)

  const broken = result.ledger.failures().length + result.problems.length
  const skipped = result.ledger.unchecked().length
  const absent = result.ledger.absent().length
  out(
    `  tally: ${result.ledger.order.length} key(s) watched, ${broken} in default, ${skipped} unchecked, ${absent} absent this time`,
  )
  out('')
}
