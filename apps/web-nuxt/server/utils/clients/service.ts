// Which client is talking to us, and whether it is too old to be served.
//
// A sideloaded APK never auto-updates, so an install from any past release can
// still be talking to today's server. Before this, it did so anonymously: there
// was no header, no server-side check, and a client the server had outgrown
// failed in whatever confusing way the change happened to produce. This turns
// that into one legible refusal.
//
// It only sees clients that identify themselves, which means builds from the
// release that introduced the header onward. Older APKs send nothing and are
// indistinguishable from a browser, so they keep being served - there is no way
// to retroactively catch them, which is the reason to start now.

/// The oldest Android build this server will serve.
///
/// Raise it ONLY when the server has actually stopped supporting something an
/// older client depends on. Every raise locks out installs that cannot update
/// themselves, so it is a deliberate act, not routine release bookkeeping.
///
/// It must never be ahead of the version being released - `apk-publish` stamps
/// an APK from the same package.json, so a floor above it refuses the build cut
/// from that very release. `floor.test.ts` fails the gate if that happens.
///
/// Starting at the release BEFORE the header existed is deliberate: no build
/// older than that identifies itself, so this is inert until someone has a real
/// reason to raise it, and the mechanism is proven by tests rather than by
/// turning users away on day one.
export const MIN_ANDROID_CLIENT = '4.8.0'

export const CLIENT_HEADER = 'x-ng-client'

export type ClientId = { platform: string; version: string }

/// `android/4.9.0`. Anything else is treated as an unidentified client (a
/// browser, curl, a bot) rather than a malformed one: the header is advisory,
/// and refusing traffic over a header nobody is required to send would take the
/// web app down the first time it got the shape wrong.
export function parseClientHeader(raw: unknown): ClientId | null {
  if (typeof raw !== 'string') return null
  const m = /^([a-z]{1,16})\/(\d{1,6}(?:\.\d{1,6}){0,3})$/.exec(raw.trim().toLowerCase())
  return m ? { platform: m[1]!, version: m[2]! } : null
}

/// Numeric, segment by segment. A string compare puts "4.10.0" before "4.9.0",
/// which is the kind of bug that ships once and then quietly refuses to serve
/// everybody on the newest build.
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/// True when this client is below the floor for its platform. An unidentified
/// client is never too old - it cannot be placed, so it is served.
export function isClientTooOld(client: ClientId | null, minAndroid = MIN_ANDROID_CLIENT): boolean {
  if (client?.platform !== 'android') return false
  return compareVersions(client.version, minAndroid) < 0
}

/// Whether the floor applies to this path at all.
///
/// API routes only: a page document has to keep rendering, because the website
/// is how somebody with a too-old app gets a newer one. `/api/app/android` is
/// exempt for the same reason at the API level - it is the route that says
/// which build to install, so gating it behind the check that rejected you
/// would leave the app unable to tell the user what to do about it.
export function isVersionGatedPath(path: string): boolean {
  const query = path.indexOf('?')
  const route = query === -1 ? path : path.slice(0, query)
  if (!route.startsWith('/api/')) return false
  return route !== '/api/app/android'
}
