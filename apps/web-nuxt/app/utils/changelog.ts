import { compareVersions } from '#shared/version'

// Re-exported because the about page and the header badge already import it
// from here; the implementation moved to shared/ when the client-version floor
// needed the same comparison server-side.
export { compareVersions }

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
