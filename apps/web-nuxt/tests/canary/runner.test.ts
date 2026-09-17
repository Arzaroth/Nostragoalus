/**
 * The runner, the fetcher and the CLI - the parts whose whole contract with CI
 * is an exit code, and which had no test at all.
 *
 * `.github/workflows/canary.yml` branches on that code to decide whether to file
 * an issue, so a refactor that reordered two `if` blocks would make every drift
 * report look like an outage with the suite still green.
 */
import { describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../../server/utils/providers/rate-limiter'
import { parseArgs, USAGE_ERROR } from '../../scripts/canary/cli'
import { CHECKS, Ledger, REQUIRED } from '../../scripts/canary/ledger'
import { BROKEN, DRIFT, GREEN, run, safeLine, UNREACHABLE, visit, VERDICT_PREFIX } from '../../scripts/canary/run'
import {
  describeError,
  europeanSeasonYear,
  fetchJson,
  Unreachable,
  UpstreamRejected,
  walkBackSeasons,
  type CanarySource,
} from '../../scripts/canary/source'

const TABLE = [['id', REQUIRED, CHECKS.identifier] as const]

function source(name: string, visitFn: CanarySource['visit']): CanarySource {
  return { name, plan: [['row', TABLE]], visit: visitFn }
}

const green = source('green', async () => [])
const drifted = source('drifted', async (ctx) => {
  ctx.ledger.check('row', {}, TABLE)
  return []
})
const crossOnly = source('cross', async () => ['a cross-check failed'])
const mute = source('mute', async () => {
  throw new Unreachable('https://example.test : timed out')
})
const refused = source('refused', async () => {
  throw new UpstreamRejected('https://example.test : HTTP 404', 404)
})
const bug = source('bug', async () => {
  throw new TypeError('cannot read properties of null')
})

const quiet = { out: () => {}, limiter: new RateLimiter(0) }

describe('visit', () => {
  it('keeps the keys already established when a source throws half-way', async () => {
    const dies = source('dies', async (ctx) => {
      ctx.ledger.check('row', {}, TABLE)
      throw new Unreachable('https://example.test : timed out')
    })
    const result = await visit(dies, quiet)
    expect(result.status).toBe('unreachable')
    // The whole point: a late failure used to discard the ledger and report a
    // passing outage with an empty report.
    expect(result.ledger.failures()).toEqual(['row.id'])
  })

  it('calls a refused route drift, not weather', async () => {
    const result = await visit(refused, quiet)
    expect(result.status).toBe('red')
    expect(result.problems.join(' ')).toContain('the feed refused a route the app reads')
  })

  it('calls our own throw broken, and does not let it escape', async () => {
    const result = await visit(bug, quiet)
    expect(result.status).toBe('broken')
    expect(result.problems.join(' ')).toContain('the canary itself threw')
  })

  it('declares every planned key even when the source does nothing', async () => {
    const result = await visit(green, quiet)
    expect(result.ledger.order).toEqual(['row.id'])
    expect(result.status).toBe('green')
  })
})

describe('run exit codes', () => {
  const codeOf = (sources: CanarySource[]) => run({ sources, ...quiet })

  it('is GREEN when every source is', async () => {
    await expect(codeOf([green])).resolves.toBe(GREEN)
  })

  it('is DRIFT for a missing key', async () => {
    await expect(codeOf([drifted])).resolves.toBe(DRIFT)
  })

  it('is DRIFT for a cross-check failure with a clean ledger', async () => {
    await expect(codeOf([crossOnly])).resolves.toBe(DRIFT)
  })

  it('is UNREACHABLE when a source could not be reached', async () => {
    await expect(codeOf([mute])).resolves.toBe(UNREACHABLE)
  })

  it('prefers drift over an unreachable sibling, so the alarm is still filed', async () => {
    await expect(codeOf([mute, drifted])).resolves.toBe(DRIFT)
  })

  it('prefers our own breakage over everything, so we fix the canary first', async () => {
    await expect(codeOf([bug, drifted, mute])).resolves.toBe(BROKEN)
  })

  it('never returns DRIFT for a broken canary, which would blame the feed', async () => {
    await expect(codeOf([bug])).resolves.not.toBe(DRIFT)
  })
})

describe('run report', () => {
  const capture = async (sources: CanarySource[]) => {
    const lines: string[] = []
    const code = await run({ sources, out: (line) => lines.push(line), limiter: new RateLimiter(0) })
    return { code, text: lines.join('\n') }
  }

  it('emits a machine-readable verdict the workflow can grep', async () => {
    expect((await capture([green])).text).toContain(`${VERDICT_PREFIX} green`)
    expect((await capture([drifted])).text).toContain(`${VERDICT_PREFIX} drift`)
    expect((await capture([mute])).text).toContain(`${VERDICT_PREFIX} unreachable`)
    expect((await capture([bug])).text).toContain(`${VERDICT_PREFIX} broken`)
  })

  it('names every finding in a summary, so a truncated issue body is still actionable', async () => {
    const { text } = await capture([drifted, crossOnly])
    expect(text).toContain('--- what to look at ---')
    expect(text).toContain('drifted: row.id')
    expect(text).toContain('cross: a cross-check failed')
  })

  it('prints the report even when a source is unreachable', async () => {
    expect((await capture([mute])).text).toContain('UNREACHABLE')
  })
})

describe('safeLine', () => {
  it('cannot close the markdown fence of the issue body', () => {
    expect(safeLine('oops\n```\n@everyone')).toBe("oops ''' @everyone")
  })

  it('truncates a value a hostile feed made enormous', () => {
    expect(safeLine('x'.repeat(500)).length).toBeLessThanOrEqual(303)
  })
})

describe('fetchJson', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('returns the body on the first try', async () => {
    const impl = vi.fn(async () => ok({ hello: 'world' }))
    await expect(fetchJson('https://e.test', { fetchImpl: impl as never })).resolves.toEqual({ hello: 'world' })
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('retries once after a pause, so a one-second blip is survived', async () => {
    const sleep = vi.fn(async () => {})
    let call = 0
    const impl = vi.fn(async () => (++call === 1 ? new Response('', { status: 503 }) : ok({ ok: true })))
    await expect(fetchJson('https://e.test', { fetchImpl: impl as never, sleep })).resolves.toEqual({ ok: true })
    expect(impl).toHaveBeenCalledTimes(2)
    // The pause is the point: retrying within the same millisecond is not a
    // retry, and the old code did exactly that.
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('gives up as Unreachable after the last attempt', async () => {
    const impl = vi.fn(async () => new Response('', { status: 503 }))
    await expect(
      fetchJson('https://e.test', { fetchImpl: impl as never, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(Unreachable)
    expect(impl).toHaveBeenCalledTimes(2)
  })

  it('does not retry a refusal, and reports it as drift', async () => {
    const impl = vi.fn(async () => new Response('', { status: 404 }))
    await expect(fetchJson('https://e.test', { fetchImpl: impl as never })).rejects.toBeInstanceOf(UpstreamRejected)
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('treats 429 as weather rather than drift, and does not hammer it', async () => {
    const sleep = vi.fn(async () => {})
    const impl = vi.fn(async () => new Response('', { status: 429 }))
    await expect(fetchJson('https://e.test', { fetchImpl: impl as never, sleep })).rejects.toBeInstanceOf(Unreachable)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not mistake a falsy JSON body for an empty one', async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify(0), { status: 200 }))
    await expect(fetchJson('https://e.test', { fetchImpl: impl as never })).resolves.toBe(0)
  })

  it('retries a null body, which is how this feed spells "nothing here"', async () => {
    const impl = vi.fn(async () => new Response('null', { status: 200 }))
    await expect(
      fetchJson('https://e.test', { fetchImpl: impl as never, sleep: async () => {} }),
    ).rejects.toThrow('empty body')
  })
})

describe('walkBackSeasons', () => {
  const usable = (rows: number[]) => rows.length > 0

  it('stops at the newest year that satisfies the caller', async () => {
    const walk = await walkBackSeasons<number[]>({
      from: 2026,
      back: 4,
      fetch: async (year) => (year === 2026 ? [1] : []),
      usable,
    })
    expect(walk.year).toBe(2026)
    expect(walk.skipped).toEqual([])
  })

  it('reports the newer years it had to skip, which is the staleness signal', async () => {
    const walk = await walkBackSeasons<number[]>({
      from: 2026,
      back: 4,
      fetch: async (year) => (year === 2024 ? [1] : []),
      usable,
    })
    expect(walk.year).toBe(2024)
    expect(walk.skipped).toEqual([2026, 2025])
  })

  it('gives back the last answer when no year satisfies', async () => {
    const walk = await walkBackSeasons<number[]>({ from: 2026, back: 2, fetch: async () => [], usable })
    expect(walk.value).toEqual([])
    expect(walk.probed).toEqual([2026, 2025])
  })
})

describe('europeanSeasonYear', () => {
  it('turns over in July, not in January', () => {
    expect(europeanSeasonYear(new Date('2026-06-30T00:00:00Z'))).toBe(2025)
    expect(europeanSeasonYear(new Date('2026-07-01T00:00:00Z'))).toBe(2026)
    expect(europeanSeasonYear(new Date('2026-12-31T00:00:00Z'))).toBe(2026)
    expect(europeanSeasonYear(new Date('2026-01-01T00:00:00Z'))).toBe(2025)
  })
})

describe('describeError', () => {
  it('reads a thrown non-Error without crashing the report', () => {
    expect(describeError('plain string')).toBe('plain string')
    expect(describeError(new Error('boom'))).toBe('boom')
  })
})

describe('parseArgs', () => {
  const known = ['espn', 'fifa']

  it('means all sources when the flag is absent', () => {
    expect(parseArgs([], known)).toEqual({ names: null })
  })

  it('accepts both spellings of the flag', () => {
    expect(parseArgs(['--sources', 'espn,fifa'], known).names).toEqual(['espn', 'fifa'])
    expect(parseArgs(['--sources=espn'], known).names).toEqual(['espn'])
  })

  it('complains about a bare flag rather than silently running everything', () => {
    expect(parseArgs(['--sources'], known).error).toContain('needs a value')
  })

  it('complains about ONE bad name in a list, rather than quietly dropping it', () => {
    // The old guard only fired when nothing matched, so `espn,esnp` probed espn
    // and reported green for a source nobody had visited.
    const parsed = parseArgs(['--sources', 'espn,esnp'], known)
    expect(parsed.names).toBeNull()
    expect(parsed.error).toContain('esnp')
  })

  it('has a usage code of its own, so a typo is not filed as drift', () => {
    expect(USAGE_ERROR).not.toBe(DRIFT)
    expect(USAGE_ERROR).not.toBe(GREEN)
  })
})

describe('Ledger construction from a plan', () => {
  it('declares nothing when the plan is empty', () => {
    expect(new Ledger().order).toEqual([])
  })
})
