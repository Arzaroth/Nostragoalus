/**
 * The canary's book-keeping: one line per key we watch on an upstream feed.
 *
 * A key cannot be judged on a single object - these feeds fill in what they
 * like, when they like. So every key is observed across every object of its
 * kind, and the verdict falls at the end.
 *
 * Three levels of demand, because "gone", "not right now" and "not often" are
 * three different facts and only the first is a defect:
 *
 *   REQUIRED - must be on every object of its kind. A fixture with no kickoff
 *              time does not exist.
 *   SAMPLED  - only lives in some contexts (a penalty score, a substitution).
 *              It must turn up at least once across everything inspected. If
 *              the context never arose - nobody was sent off all week - the key
 *              is reported `unchecked`, which is NOT a failure. Without that
 *              third verdict a quiet July would go red every morning, and a red
 *              that is always on is a red nobody reads.
 *   RARE     - the context is real but too rare to be sure of finding in one
 *              day's sample: an own goal, a VAR decision's free text. Never
 *              fails on absence (that would be a monthly false alarm), still
 *              fails on a wrong type, and still prints - so a key that has gone
 *              quiet for weeks is visible to a reader even though it is not
 *              ringing the alarm.
 */

export const REQUIRED = 'required'
export const SAMPLED = 'sampled'
export const RARE = 'rare'

export type Level = typeof REQUIRED | typeof SAMPLED | typeof RARE
export type Verdict = 'ok' | 'MISSING' | 'TYPE' | 'unchecked' | 'absent'

export interface Check {
  label: string
  test: (value: unknown) => boolean
}

export type KeySpec = readonly [path: string, level: Level, expected: Check]
export type Table = readonly KeySpec[]
export type Plan = readonly (readonly [scope: string, table: Table])[]

const check = (label: string, test: (value: unknown) => boolean): Check => ({ label, test })

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function digits(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * A key the providers declare as `T | null` is nullable by contract - FIFA's
 * IdGroup is null on every knockout tie, by design. Wrapping the check keeps it
 * REQUIRED (so the key vanishing is still caught) without calling a legitimate
 * null a type change.
 */
export function nullable(inner: Check): Check {
  return check(`${inner.label} or null`, (value) => value === null || inner.test(value))
}

export function oneOf(label: string, allowed: readonly string[]): Check {
  return check(label, (value) => typeof value === 'string' && allowed.includes(value))
}

export const CHECKS = {
  list: check('list', (value) => Array.isArray(value)),
  filledList: check('non-empty list', (value) => Array.isArray(value) && value.length > 0),
  object: check('object', isObject),
  text: check('text', (value) => typeof value === 'string'),
  filledText: check('non-empty text', (value) => typeof value === 'string' && value.trim() !== ''),
  // Every provider funnels ids through String(), so a number is as good as text.
  identifier: check(
    'identifier',
    (value) => (typeof value === 'string' || typeof value === 'number') && digits(value) !== '',
  ),
  integer: check('integer', (value) => digits(value) !== '' && Number.isInteger(Number(digits(value)))),
  number: check('number', (value) => digits(value) !== '' && Number.isFinite(Number(digits(value)))),
  boolean: check('boolean', (value) => typeof value === 'boolean'),
  // What every normalizer hands to `new Date()` before calling .toISOString().
  date: check('date', (value) => typeof value === 'string' && Number.isFinite(new Date(value).getTime())),
  epochMillis: check('epoch millis', (value) => typeof value === 'number' && Number.isFinite(value) && value > 0),
  url: check('http url', (value) => typeof value === 'string' && /^https?:\/\//i.test(value)),
} as const

interface Entry {
  level: Level
  expected: Check
  seen: number
  missing: number
  bad: number
  sample: string
}

/** Walks a dotted path, with numeric segments indexing arrays. */
export function dig(root: unknown, path: string): { found: boolean; value: unknown } {
  let current: unknown = root
  for (const key of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false, value: null }
      current = current[index]
      continue
    }
    // `key in current` and not a truthiness test: a key present and holding null
    // is a different fact from a key that is gone, and only the checks decide
    // whether that null is allowed.
    if (!isObject(current) || !(key in current)) return { found: false, value: null }
    current = current[key]
  }
  return { found: true, value: current }
}

export class Ledger {
  readonly order: string[] = []
  readonly entries = new Map<string, Entry>()
  readonly anomalies: string[] = []

  constructor(plan: Plan = []) {
    // Declared up front, before anything is fetched: a key no object let us look
    // at has to report `unchecked` rather than quietly drop out of the report.
    for (const [scope, table] of plan) {
      for (const [path, level, expected] of table) this.declare(`${scope}.${path}`, level, expected)
    }
  }

  declare(path: string, level: Level, expected: Check): void {
    if (this.entries.has(path)) return
    this.entries.set(path, { level, expected, seen: 0, missing: 0, bad: 0, sample: '' })
    this.order.push(path)
  }

  /** One observation of `path`, on one object of its kind. */
  observe(path: string, level: Level, expected: Check, found: boolean, value?: unknown): void {
    this.declare(path, level, expected)
    const entry = this.entries.get(path)!
    // An explicit null on a contextual key is the feed saying "nothing here this
    // time", which is what SAMPLED and RARE already mean - World Rugby spells it
    // out where ESPN just omits the key, and the two must read the same. Only
    // REQUIRED holds a null against the feed, and a REQUIRED key that is allowed
    // to be null says so with nullable().
    if (!found || (value === null && level !== REQUIRED)) {
      entry.missing += 1
      return
    }
    entry.seen += 1
    if (expected.test(value)) return
    entry.bad += 1
    if (!entry.sample) entry.sample = JSON.stringify(value ?? null)?.slice(0, 40) ?? String(value)
  }

  /** Confronts one object with the table that describes its kind. */
  check(scope: string, target: unknown, table: Table): void {
    for (const [path, level, expected] of table) {
      const { found, value } = dig(target, path)
      this.observe(`${scope}.${path}`, level, expected, found, value)
    }
  }

  /** Something that fits no table: an entry of a list that is not an object. */
  anomaly(message: string): void {
    if (!this.anomalies.includes(message)) this.anomalies.push(message)
  }

  verdict(path: string): Verdict {
    const entry = this.entries.get(path)
    if (!entry) return 'unchecked'
    if (entry.bad) return 'TYPE'
    // No object of this kind turned up at all: the key is not absent, it simply
    // could not be looked at.
    if (!entry.seen && !entry.missing) return 'unchecked'
    if (entry.level === REQUIRED) return entry.missing ? 'MISSING' : 'ok'
    if (entry.seen) return 'ok'
    return entry.level === RARE ? 'absent' : 'MISSING'
  }

  failures(): string[] {
    const broken = this.order.filter((path) => this.verdict(path) === 'MISSING' || this.verdict(path) === 'TYPE')
    return [...broken, ...this.anomalies]
  }

  unchecked(): string[] {
    return this.order.filter((path) => this.verdict(path) === 'unchecked')
  }

  /** Watched, looked for, and not seen this time - allowed, and worth printing. */
  absent(): string[] {
    return this.order.filter((path) => this.verdict(path) === 'absent')
  }

  lines(): string[] {
    const out = this.order.map((path) => {
      const entry = this.entries.get(path)!
      const total = entry.seen + entry.missing
      let line = `  ${this.verdict(path).padEnd(10)} ${path.padEnd(52)} ${entry.expected.label.padEnd(18)} ${entry.seen}/${total}`
      if (entry.bad) line += `  (${entry.bad} of the wrong type, e.g. ${entry.sample})`
      return line
    })
    return [...out, ...this.anomalies.map((message) => `  ${'ANOMALY'.padEnd(10)} ${message}`)]
  }
}
