import { useRuntimeConfig } from '#imports'

// Fail closed on a weak auth secret in production. `betterAuthSecret` defaults to
// an empty string (nuxt.config.ts) and better-auth + the signed-token codec both
// key off it: an empty or trivially short secret makes session cookies and every
// share/feed/wrapped capability token forgeable. Rather than boot silently with
// insecure keys, refuse to start so a misconfigured deploy is a hard, loud
// failure. Dev/test are exempt so local runs and pglite tests need no real secret.
const MIN_SECRET_LENGTH = 32

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') return
  // Mirror the resolution order better-auth itself uses (lib/auth.ts): a deploy
  // may set BETTER_AUTH_SECRET directly, which never populates
  // runtimeConfig.betterAuthSecret, so checking only the config would false-throw.
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? useRuntimeConfig().betterAuthSecret ?? ''
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET is missing or too short (need >= ${MIN_SECRET_LENGTH} chars). ` +
        'Refusing to start: session cookies and share/feed tokens would be forgeable. ' +
        'Set a strong NUXT_BETTER_AUTH_SECRET / BETTER_AUTH_SECRET and redeploy.',
    )
  }
})
