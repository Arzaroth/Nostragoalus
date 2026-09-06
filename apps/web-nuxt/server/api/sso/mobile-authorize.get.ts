import { auth } from '../../../lib/auth'
import { isOpaqueNonce, MOBILE_SSO_CALLBACK_PATH, mobileSsoParkCallback } from '../../utils/sso/mobile-exchange'

// Starts the mobile SSO handshake INSIDE the browser, and exists only because of
// where better-auth keeps its CSRF state.
//
// `/sign-in/sso` returns the IdP authorize URL and, on the same response, sets a
// signed `state` cookie that the callback later has to match. A native app that
// fetches that URL over its own HTTP client keeps the cookie in the app, not in
// the browser that goes on to do the round trip, so better-auth rejects the
// callback with "State mismatch: State not persisted correctly" and the sign-in
// dies one step before ours. Doing the sign-in here, in the request the browser
// itself made, puts the cookie where the callback will look for it.
//
// Public and unauthenticated by necessity (nobody is signed in yet), and it adds
// no reach: `/api/auth/sign-in/sso` was always callable by anyone. The only
// redirect target is the authorize URL better-auth derived from a registered
// provider, so this cannot be pointed anywhere of the caller's choosing.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const providerId = typeof query.providerId === 'string' ? query.providerId : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const challenge = typeof query.challenge === 'string' ? query.challenge : ''

  // The app's own origin, not the request's: Host is caller-controlled.
  const configured = process.env.BETTER_AUTH_URL ?? process.env.NUXT_PUBLIC_AUTH_URL
  const origin = configured || getRequestURL(event).origin

  // Every failure ends at the App Link rather than on a web page, so the browser
  // tab closes back into the app and it can say the round trip failed. The
  // reason is never echoed: this is a public endpoint and the app only needs to
  // know that it did not work.
  const bail = () => {
    const target = new URL(MOBILE_SSO_CALLBACK_PATH, origin)
    target.searchParams.set('state', isOpaqueNonce(state) ? state : '')
    target.searchParams.set('error', 'sso_failed')
    return sendRedirect(event, target.toString(), 302)
  }

  if (!providerId || !isOpaqueNonce(state) || !isOpaqueNonce(challenge)) return bail()

  try {
    const res = await auth.api.signInSSO({
      body: { providerId, callbackURL: mobileSsoParkCallback(state, challenge) },
      headers: event.headers,
      asResponse: true,
    })
    // The whole point: better-auth set its state cookie on this response, so it
    // has to reach the browser or the callback has nothing to match.
    for (const cookie of res.headers.getSetCookie()) {
      appendResponseHeader(event, 'set-cookie', cookie)
    }
    const body = (await res.json()) as { url?: unknown }
    if (typeof body?.url !== 'string' || !body.url) return bail()
    return sendRedirect(event, body.url, 302)
  } catch {
    return bail()
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['SSO'],
    summary: 'Start a mobile SSO sign-in',
    description:
      'Opened by the native app in a browser tab. Runs the better-auth SSO sign-in in that browser so its CSRF state cookie is set there, then redirects to the identity provider. Any failure redirects to the app link with `error=sso_failed`.',
    parameters: [
      { name: 'providerId', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'state', in: 'query', required: true, schema: { type: 'string' }, description: 'Client nonce, base64url.' },
      {
        name: 'challenge',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'base64url SHA-256 of the client verifier.',
      },
    ],
    responses: {
      302: { description: 'Redirect to the identity provider, or to the app link on failure.' },
    },
  },
})
