import { auth } from '../../../lib/auth'
import { db } from '../../../db'
import { createRateLimiter } from '../../utils/rate-limit'
import { isProviderEnabled } from '../../utils/sso/service'
import { isOpaqueNonce, MOBILE_SSO_CALLBACK_PATH, mobileSsoParkCallback } from '../../utils/sso/mobile-exchange'

// Starting a sign-in costs a provider lookup, possibly an outbound discovery
// fetch at the customer's IdP, and a verification row nothing sweeps until it is
// read. Unauthenticated by necessity, so it gets the same treatment the exchange
// route has.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

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

  // This route drives a whole SSO round trip, and its product is a brand-new
  // session for whoever's browser followed it. A page that navigates here from
  // another site is doing that TO someone: it can pick the state and challenge,
  // let the victim's live IdP session complete the hop silently, and collect the
  // parked bearer. The app opens this itself, so the legitimate request has no
  // initiator (`none`) or is same-origin. Absent means a client that does not
  // send the header at all, which is not evidence of an attack - so this blocks
  // the values a cross-site navigation actually carries rather than demanding a
  // value, and cannot break a client that omits it.
  const site = getRequestHeader(event, 'sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') return bail()

  if (!limiter.allow(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')) return bail()

  // The /api/auth catch-all gates the CALLBACK on provider status, and calling
  // auth.api directly walks around it. Without this a draft or disabled provider
  // still answers here, which both leaks that it exists and points unsolicited
  // authorize traffic at an IdP the operator has not turned on.
  if (!(await isProviderEnabled(db, providerId))) return bail()

  try {
    const failure = new URL(MOBILE_SSO_CALLBACK_PATH, origin)
    failure.searchParams.set('state', state)
    const res = await auth.api.signInSSO({
      body: {
        providerId,
        callbackURL: mobileSsoParkCallback(state, challenge),
        // Without this, anything that goes wrong after the IdP - the user
        // pressing Deny, a discovery failure - lands on the web /login page via
        // onAPIError.errorURL. That is not a URL the app intercepts, so the tab
        // sits on a login form and the spinner never stops. Send failures to the
        // App Link instead, where the app can close the tab and say so.
        errorCallbackURL: failure.toString(),
      },
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
  } catch (error) {
    // The app is told only that the round trip failed, so without a log here an
    // outage in this route is indistinguishable from a user pressing Cancel.
    console.error('[sso] mobile-authorize failed', error)
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
