// Digital Asset Links (Android) and Apple App Site Association (iOS): the two
// files a domain serves so the OS will VERIFY that an app owns its https links,
// instead of offering the app in a disambiguation chooser that any other app can
// join.
//
// The identities below are configuration, never committed constants. The Android
// debug keystore is a well-known shared secret shipped with every SDK, so
// publishing its fingerprint here would let ANY debug-signed app on the planet
// claim this domain's links - strictly worse than serving nothing. Unset means
// "no file", which is exactly the pre-existing behaviour.
export const ANDROID_PACKAGE = 'com.arzaroth.nostragoalus'

// Upper-case hex byte pairs, as `keytool`/`apksigner`/Play Console print them.
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
// <10-char Apple Team ID>.<bundle id>
const APPLE_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

// The assetlinks.json body, or null when no fingerprint is configured.
export function assetLinks(fingerprints: string | undefined): unknown[] | null {
  const list = splitList(fingerprints)
    .map((f) => f.toUpperCase())
    .filter((f) => SHA256_FINGERPRINT.test(f))
  if (!list.length) return null
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: list },
    },
  ]
}

// The apple-app-site-association body, or null when no app ID is configured.
// Every path is claimed: the app routes share cards, leagues and matches as well
// as the SSO callback.
export function appleAppSiteAssociation(appIds: string | undefined): unknown | null {
  const list = splitList(appIds).filter((id) => APPLE_APP_ID.test(id))
  if (!list.length) return null
  return { applinks: { details: [{ appIDs: list, components: [{ '/': '*' }] }] } }
}
