import { compareVersions } from '#shared/version'

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

/// The oldest Android build this server will serve, unless
/// `NUXT_MIN_ANDROID_CLIENT` overrides it at runtime.
///
/// Raise it ONLY when the server has actually stopped supporting something an
/// older client depends on. Every raise locks out installs that cannot update
/// themselves, so it is a deliberate act, not routine release bookkeeping - and
/// setting it TO the version being released refuses every install except the one
/// cut from that release, which is a force-upgrade, not a floor.
///
/// It must never be ahead of the version being released: `apk-publish` stamps an
/// APK from the same package.json, so a floor above it refuses the build cut
/// from that very release. `floor.test.ts` fails the gate if that happens.
///
/// This is a MOBILE app version (apps/mobile-flutter/app/pubspec.yaml), not a
/// site version - the two lines were split, and the app restarted at 1.0.0.
///
/// Inert at the app's first version, which is the point: the mechanism is proven
/// by tests rather than by turning anyone away on day one.
///
/// One artifact of the reset: builds from before the split report 4.x, which
/// compares as NEWER than any 1.x app release, so they are served whatever the
/// floor says. Only one device ever ran one, and it stops reporting 4.x the
/// moment it updates.
export const MIN_ANDROID_CLIENT = '1.0.0'

export const CLIENT_HEADER = 'x-ng-client'

/// The one API route the floor never applies to: it is the route that says which
/// build to install, so gating it behind the check that rejected you would leave
/// the app unable to tell the user what to do about it.
export const CLIENT_GATE_EXEMPT = '/api/app/android'

export type ClientId = { platform: string; version: string }

export type ClientRefusal = { error: 'client_too_old'; minimum: string; current: string }

/// `android/4.9.0`. Anything else is treated as an unidentified client (a
/// browser, curl, a bot, or a duplicated header Node has joined with a comma)
/// rather than a malformed one: the header is advisory, and refusing traffic
/// over a header nobody is required to send would take the web app down the
/// first time it got the shape wrong.
export function parseClientHeader(raw: unknown): ClientId | null {
  if (typeof raw !== 'string') return null
  const m = /^([a-z]{1,16})\/(\d{1,6}(?:\.\d{1,6}){0,3})$/.exec(raw.trim().toLowerCase())
  return m ? { platform: m[1]!, version: m[2]! } : null
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
/// is how somebody with a too-old app gets a newer one. A trailing slash is
/// stripped before the exemption is matched, because the router resolves
/// `/api/app/android/` to the same handler - gating it there would break the
/// escape hatch for anything that normalizes a URL by appending one.
export function isVersionGatedPath(path: string): boolean {
  const query = path.indexOf('?')
  const route = query === -1 ? path : path.slice(0, query)
  if (!route.startsWith('/api/')) return false
  const bare = route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route
  return bare !== CLIENT_GATE_EXEMPT
}

/// The whole decision, so the middleware is a shell around something testable
/// and the COMPOSITION is covered rather than only its three parts. Null serves
/// the request.
export function clientRefusal(
  path: string,
  header: unknown,
  minAndroid = MIN_ANDROID_CLIENT,
): ClientRefusal | null {
  if (!isVersionGatedPath(path)) return null
  const client = parseClientHeader(header)
  if (!isClientTooOld(client, minAndroid)) return null
  return { error: 'client_too_old', minimum: minAndroid, current: client!.version }
}

/// The floor actually in force. The override exists so a floor set too high is
/// recoverable by restarting the container with an env var, instead of by
/// editing code, rebuilding the image and redeploying while every mobile user is
/// locked out. A value that is not a plain dotted version is ignored rather than
/// obeyed: a typo in an env var must not become an outage.
export function resolveMinAndroidClient(override: unknown): string {
  if (typeof override !== 'string') return MIN_ANDROID_CLIENT
  const trimmed = override.trim()
  return /^\d{1,6}(\.\d{1,6}){0,3}$/.test(trimmed) ? trimmed : MIN_ANDROID_CLIENT
}
