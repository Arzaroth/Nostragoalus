// Changelog parsing + "since last seen" comparison. Pure functions so the
// about page, the header badge and the highlight all share one source of truth
// (and sit under the coverage gate). The raw CHANGELOG.md is imported with
// `?raw` by the callers and parsed here.

export interface ChangelogSection {
  title: string
  items: string[]
}

export interface ChangelogVersion {
  version: string
  date: string
  sections: ChangelogSection[]
}

// Minimal Keep-a-Changelog parser: versions -> sections -> bullets. The
// `[Unreleased]` block is dropped (nothing to show / compare against yet).
export function parseChangelog(raw: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | null = null
  let section: ChangelogSection | null = null
  for (const line of raw.split('\n')) {
    const v = /^## \[([^\]]+)\](?: - (.+))?/.exec(line)
    if (v) {
      current = { version: v[1], date: v[2] ?? '', sections: [] }
      section = null
      if (v[1].toLowerCase() !== 'unreleased') versions.push(current)
      continue
    }
    const s = /^### (.+)/.exec(line)
    if (s && current) {
      section = { title: s[1], items: [] }
      current.sections.push(section)
      continue
    }
    const b = /^- (.+)/.exec(line)
    if (b && section) section.items.push(b[1])
  }
  return versions
}

// Overlay a locale's parsed changelog onto the canonical (English) one. The
// English file owns which versions exist and their order; for each version we
// swap in the locale's translated sections when present, and fall back to the
// English entry when that version isn't translated yet. An empty/missing locale
// list yields the English changelog untouched.
export function selectLocaleChangelog(
  base: ChangelogVersion[],
  localized: ChangelogVersion[] | undefined,
): ChangelogVersion[] {
  if (!localized?.length) return base
  const byVersion = new Map(localized.map((v) => [v.version, v]))
  return base.map((v) => byVersion.get(v.version) ?? v)
}

// Compare dotted numeric versions ("1.9.0" < "1.10.0"). A non-numeric segment
// (never expected from our changelog) falls back to a lexical compare of that
// segment - not of the whole string - so earlier numeric segments still order
// first and the function totally orders rather than throwing.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '0'
    const sb = pb[i] ?? '0'
    const x = Number(sa)
    const y = Number(sb)
    if (Number.isNaN(x) || Number.isNaN(y)) {
      if (sa === sb) continue
      return sa < sb ? -1 : 1
    }
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// The newest version present, or null for an empty changelog. Independent of
// the file's ordering so the badge can't be fooled by an out-of-order entry.
export function latestVersion(versions: ChangelogVersion[]): string | null {
  let latest: string | null = null
  for (const v of versions) {
    if (latest === null || compareVersions(v.version, latest) > 0) latest = v.version
  }
  return latest
}

// A version is "unseen" when it is strictly newer than what the user last
// acknowledged. A null/empty last-seen means "not yet baselined" - no
// highlight and no badge (the client baselines it to the latest on first load,
// so the badge only fires on the next release, not the whole back catalogue).
export function isUnseen(version: string, lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false
  return compareVersions(version, lastSeen) > 0
}
