import enRaw from '../../CHANGELOG.md?raw'
import frRaw from '../../i18n/changelogs/fr.md?raw'
import thRaw from '../../i18n/changelogs/th.md?raw'
import tlhRaw from '../../i18n/changelogs/tlh.md?raw'
import arRaw from '../../i18n/changelogs/ar.md?raw'
import { parseChangelog, latestVersion, isUnseen, selectLocaleChangelog, type ChangelogVersion } from '~/utils/changelog'

// The changelog is a build-time constant, so parse each locale once at module
// load and share the result across every consumer (header badge, about page).
// English (CHANGELOG.md) is canonical: it owns the version list, the ordering,
// and the "latest" used by the badge - all locale-independent (the headers are
// identical across files). The translated files only supply per-version copy.
const enVersions = parseChangelog(enRaw)
const localized: Record<string, ChangelogVersion[]> = {
  fr: parseChangelog(frRaw),
  th: parseChangelog(thRaw),
  tlh: parseChangelog(tlhRaw),
  ar: parseChangelog(arRaw),
}
const latest = latestVersion(enVersions)

interface SeenUser {
  lastSeenChangelogVersion?: string | null
}

// "Since last seen" state: the version the signed-in user last acknowledged
// (rides the session as a better-auth additionalField), whether anything is
// newer than that, and the two writes that move the marker. Signed out, there
// is no marker and nothing to badge.
export function useChangelog() {
  const { session, updateUser } = useAuth()
  const { locale } = useI18n()

  // Render the active locale's changelog, English entries filling any gaps.
  const versions = computed(() => selectLocaleChangelog(enVersions, localized[locale.value]))

  const user = computed(() => session.value?.data?.user as SeenUser | undefined)
  const lastSeen = computed(() => user.value?.lastSeenChangelogVersion ?? null)
  const hasUnseen = computed(() => !!latest && isUnseen(latest, lastSeen.value))

  async function persist(version: string) {
    // Cosmetic, low-stakes, and a no-op when signed out: a rejected save must
    // never bubble up.
    try {
      await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)({ lastSeenChangelogVersion: version })
    } catch {
      // ignore
    }
  }

  // Mark the changelog read: advance the marker to the newest version. Called
  // when the user opens the changelog; clears the badge.
  async function markSeen() {
    if (!user.value || !latest || lastSeen.value === latest) return
    await persist(latest)
  }

  // One-time baseline for a signed-in user with no marker yet, so the badge
  // fires on the next release rather than the whole back catalogue.
  async function ensureBaseline() {
    if (!user.value || !latest || lastSeen.value != null) return
    await persist(latest)
  }

  return { versions, latest, user, lastSeen, hasUnseen, markSeen, ensureBaseline }
}
