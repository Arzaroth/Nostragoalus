import { fetchJson, Unreachable, type CanarySource, type SourceResult } from './source'
import { Ledger } from './ledger'
import { espnSource } from './sources/espn'
import { fifaSource } from './sources/fifa'
import { uefaSource } from './sources/uefa'
import { worldRugbySource } from './sources/worldrugby'

export const GREEN = 0
export const RED = 1
export const UNREACHABLE = 2

export function allSources(): CanarySource[] {
  return [espnSource(), fifaSource(), uefaSource(), worldRugbySource()]
}

export interface RunOptions {
  sources?: CanarySource[]
  now?: Date
  fetchImpl?: typeof fetch
  out?: (line: string) => void
}

async function visit(source: CanarySource, options: RunOptions): Promise<SourceResult> {
  const notes: string[] = []
  const ctx = {
    now: options.now ?? new Date(),
    note: (line: string) => notes.push(line),
    getJson: <T>(url: string) =>
      fetchJson<T>(url, { headers: source.headers, fetchImpl: options.fetchImpl }),
  }

  try {
    const { ledger, problems } = await source.visit(ctx)
    const broken = ledger.failures()
    return {
      name: source.name,
      status: broken.length || problems.length ? 'red' : 'green',
      ledger,
      problems,
      notes,
    }
  } catch (error) {
    if (error instanceof Unreachable) {
      return { name: source.name, status: 'unreachable', ledger: new Ledger(), problems: [], notes, reason: error.message }
    }
    throw error
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

  const red = results.filter((r) => r.status === 'red')
  if (red.length) {
    out(`RED: the shape moved on ${red.map((r) => r.name).join(', ')}. The detail is above; the code that reads`)
    out('     these keys lives in apps/web-nuxt/server/utils/providers/.')
    return RED
  }

  const mute = results.filter((r) => r.status === 'unreachable')
  if (mute.length) {
    out(`SOURCE UNREACHABLE (${mute.map((r) => r.name).join(', ')}): nothing could be verified there.`)
    out('     A passing outage is fixed by running it again.')
    return UNREACHABLE
  }

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

function report(result: SourceResult, out: (line: string) => void): void {
  out(`--- ${result.name} ${'-'.repeat(Math.max(0, 70 - result.name.length))}`)

  if (result.status === 'unreachable') {
    out(`  UNREACHABLE  ${result.reason ?? ''}`)
    out('')
    return
  }

  for (const note of result.notes) out(`  ${note}`)
  for (const line of result.ledger.lines()) out(line)
  for (const problem of result.problems) out(`  ${'CROSS'.padEnd(10)} ${problem}`)

  const broken = result.ledger.failures().length + result.problems.length
  const skipped = result.ledger.unchecked().length
  const absent = result.ledger.absent().length
  out(
    `  tally: ${result.ledger.order.length} key(s) watched, ${broken} in default, ${skipped} unchecked, ${absent} absent this time`,
  )
  out('')
}
