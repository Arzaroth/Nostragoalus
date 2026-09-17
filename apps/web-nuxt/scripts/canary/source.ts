import { Ledger } from './ledger'

/**
 * The source did not answer. Kept apart from a shape failure all the way to the
 * exit code: an upstream having a bad afternoon is not the feed changing under
 * us, and conflating the two teaches everyone to ignore the alarm.
 */
export class Unreachable extends Error {}

export interface CanaryContext {
  getJson<T>(url: string): Promise<T>
  now: Date
  /** One line of "here is what was actually read", printed above the key table. */
  note(line: string): void
}

export interface SourceResult {
  name: string
  status: 'green' | 'red' | 'unreachable'
  ledger: Ledger
  /** Cross-check failures: the keys are there but the real code stopped working. */
  problems: string[]
  notes: string[]
  reason?: string
}

export interface CanarySource {
  name: string
  /**
   * The provider's own request headers, so the canary sees what the app sees.
   * ESPN's Akamai answers a browser-shaped User-Agent with an HTML 403, so a
   * canary that sent its own would go red on a feed the app reads perfectly.
   */
  headers?: Record<string, string>
  /** Fills a ledger and returns what the real normalizers made of the payload. */
  visit(ctx: CanaryContext): Promise<{ ledger: Ledger; problems: string[] }>
}

const TIMEOUT_MS = 20_000
const ATTEMPTS = 2

export interface FetchOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  attempts?: number
  fetchImpl?: typeof fetch
}

/**
 * A JSON body, or Unreachable. Two attempts: a one-second blip upstream must
 * not light the alarm.
 *
 * Headers are the provider's own, passed in by each source rather than invented
 * here - the canary is meant to see what the app sees. ESPN's Akamai 403s a
 * browser-shaped User-Agent in HTML, so a canary that sent its own would go red
 * on a feed the app reads perfectly well.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch
  const attempts = options.attempts ?? ATTEMPTS
  let last: unknown = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await doFetch(url, {
        headers: { accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      })
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
      last = error
    }
  }

  throw new Unreachable(`${url} : ${last instanceof Error ? last.message : String(last)}`)
}

/** `YYYYMMDD-YYYYMMDD`, the window a scoreboard is asked for when today is bare. */
export function lookbackRange(now: Date, days: number): string {
  const start = new Date(now.getTime() - days * 86_400_000)
  const stamp = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '')
  return `${stamp(start)}-${stamp(now)}`
}

/** The season year a European league is in mid-August through May. */
export function europeanSeasonYear(now: Date): number {
  const year = now.getUTCFullYear()
  return now.getUTCMonth() >= 6 ? year : year - 1
}
