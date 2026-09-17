/**
 * Argument parsing, kept out of main.ts because that module runs the canary on
 * import: a test that wanted to check the parsing would otherwise fire twenty
 * live requests and call process.exit().
 */
export const USAGE_ERROR = 64

export interface Parsed {
  names: string[] | null
  error?: string
}

/**
 * `--sources a,b` and `--sources=a,b` both, and an explicit complaint for the
 * forms that used to pass silently: a bare trailing `--sources` ran all four
 * feeds, and one typo in a list quietly probed the rest and reported green for
 * sources nobody had visited.
 */
export function parseArgs(argv: string[], known: string[]): Parsed {
  const flag = argv.find((arg) => arg === '--sources' || arg.startsWith('--sources='))
  if (!flag) return { names: null }

  const raw = flag.startsWith('--sources=') ? flag.slice('--sources='.length) : argv[argv.indexOf(flag) + 1]
  const names = (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  if (!names.length) return { names: null, error: '--sources needs a value, e.g. --sources espn,uefa' }

  const unknown = names.filter((name) => !known.includes(name))
  if (unknown.length) {
    return { names: null, error: `no such source: ${unknown.join(', ')} (known: ${known.join(', ')})` }
  }
  return { names }
}
