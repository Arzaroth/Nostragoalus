import { RateLimiter } from '../../server/utils/providers/rate-limiter'
import type { Ledger, Plan } from './ledger'

/**
 * The host did not answer, or answered in a way that says "not now": a timeout,
 * a 5xx, a 429. Kept apart from a shape failure all the way to the exit code -
 * an upstream having a bad afternoon is not the feed changing under us, and
 * conflating the two teaches everyone to ignore the alarm.
 */
export class Unreachable extends Error {}

/**
 * The host answered, and refused: a 404 or another 4xx on an endpoint the app
 * reads every day. That is NOT an outage - a documented route that has started
 * answering "no such thing" is one of the loudest forms of drift there is, and
 * reporting it as a passing blip is how a removed endpoint goes unnoticed for
 * months.
 */
export class UpstreamRejected extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface CanaryContext {
  getJson<T>(url: string): Promise<T>
  now: Date
  /**
   * Owned by the runner, not by the source: a source that throws half-way must
   * still report the keys it had already established. Building it inside
   * visit() meant a late 404 discarded ten confirmed missing keys and reported
   * a passing outage instead.
   */
  ledger: Ledger
  /** One line of "here is what was actually read", printed above the key table. */
  note(line: string): void
}

export type SourceStatus = 'green' | 'red' | 'unreachable' | 'broken'

export interface SourceResult {
  name: string
  status: SourceStatus
  ledger: Ledger
  /** Cross-check failures: the keys are there but the real code stopped working. */
  problems: string[]
  notes: string[]
  reason?: string
}

export interface CanarySource {
  name: string
  /** Declared up front so every watched key prints even if the visit dies. */
  plan: Plan
  /**
   * The provider's own request headers, so the canary sees what the app sees.
   * ESPN's Akamai answers a browser-shaped User-Agent with an HTML 403, so a
   * canary that sent its own would go red on a feed the app reads perfectly.
   */
  headers?: Record<string, string>
  /** Fills ctx.ledger and returns what the real normalizers made of the payload. */
  visit(ctx: CanaryContext): Promise<string[]>
}

const TIMEOUT_MS = 20_000
const ATTEMPTS = 2
// Long enough that a blip is actually waited out rather than re-hit within the
// same millisecond, short enough not to dominate the run.
const RETRY_PAUSE_MS = 1_500
// The providers pace themselves at one request a second against these same
// hosts (see RateLimiter in each adapter). A canary that bursts is a canary
// that earns the 429 it then reports as an outage.
export const POLITE_INTERVAL_MS = 1_000

export interface FetchOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  attempts?: number
  fetchImpl?: typeof fetch
  limiter?: RateLimiter
  sleep?: (ms: number) => Promise<void>
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A 4xx that means "this thing is gone", as opposed to "slow down" or "later". */
function isRejection(status: number): boolean {
  if (status === 408 || status === 429) return false
  return status >= 400 && status < 500
}

/**
 * A JSON body, or Unreachable / UpstreamRejected. Two attempts with a pause
 * between them, so a one-second blip upstream does not light the alarm.
 *
 * Headers are the provider's own, passed in by each source rather than invented
 * here - the canary is meant to see what the app sees.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch
  const attempts = options.attempts ?? ATTEMPTS
  const sleep = options.sleep ?? defaultSleep
  let last: unknown = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_PAUSE_MS)
    await options.limiter?.acquire()
    try {
      const response = await doFetch(url, {
        headers: { accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      })
      if (isRejection(response.status)) {
        // Not retried: a 404 will still be a 404 in a second and a half, and
        // this is a finding rather than a blip.
        throw new UpstreamRejected(`${url} : HTTP ${response.status}`, response.status)
      }
      if (!response.ok) {
        last = new Error(`HTTP ${response.status}`)
        continue
      }
      const payload = (await response.json()) as T
      if (payload === null || payload === undefined) {
        last = new Error('empty body')
        continue
      }
      return payload
    } catch (error) {
      if (error instanceof UpstreamRejected) throw error
      last = error
    }
  }

  throw new Unreachable(`${url} : ${describeError(last)}`)
}

/** A limiter per source, so one slow feed does not pace the others. */
export function politeLimiter(): RateLimiter {
  return new RateLimiter(POLITE_INTERVAL_MS)
}

/** The season year a European league is in from mid-August through May. */
export function europeanSeasonYear(now: Date): number {
  const year = now.getUTCFullYear()
  return now.getUTCMonth() >= 6 ? year : year - 1
}

export interface WalkBackResult<T> {
  value: T | null
  year: number
  probed: number[]
  /** The newest years that answered with nothing before one finally did. */
  skipped: number[]
}

/**
 * Walk back season years until one satisfies `usable`, newest first.
 *
 * `usable` is not "non-empty": accepting the first season that returns anything
 * is how the canary ended up greenlighting a two-year-old archive while the
 * CURRENT season's endpoint answered with nothing at all - the exact drift it
 * exists to catch. Callers ask for a season that carries a PLAYED match, and
 * `skipped` reports the newer ones that came back bare so the source can say so.
 */
export async function walkBackSeasons<T>(opts: {
  from: number
  back: number
  fetch: (year: number) => Promise<T>
  usable: (value: T) => boolean
}): Promise<WalkBackResult<T>> {
  const probed: number[] = []
  const skipped: number[] = []
  let value: T | null = null
  let year = opts.from

  for (let step = 0; step < opts.back; step++) {
    year = opts.from - step
    probed.push(year)
    const answer = await opts.fetch(year)
    if (opts.usable(answer)) return { value: answer, year, probed, skipped }
    skipped.push(year)
    value = answer
  }

  return { value, year, probed, skipped }
}
