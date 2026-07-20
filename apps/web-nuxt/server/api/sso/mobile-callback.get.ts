import { auth } from '../../../lib/auth'
import { db } from '../../../db'
import { isOpaqueNonce, MOBILE_SSO_CALLBACK_PATH, parkMobileSsoToken } from '../../utils/sso/mobile-exchange'

// Public redirect target better-auth sends the mobile app's SSO round trip to.
// Same exposure as /api/sso/test-callback: unauthenticated, reached by a
// top-level browser navigation, reflecting client-supplied values. It answers
// with a Location header only - no HTML, so the reflected-XSS trap that route
// documents cannot apply here - and the reflected `state` is pinned to base64url
// before it is echoed either way.
//
// By this point better-auth has already created the session and set its cookie
// on this origin; the redirect the browser followed to get here carries it. The
// cookie value IS what the bearer plugin hands out as `set-auth-token`, so it is
// the bearer the app needs. It gets parked behind a single-use code and never
// touches the URL.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const state = typeof query.state === 'string' ? query.state : ''
  const challenge = typeof query.challenge === 'string' ? query.challenge : ''
  const target = new URL(MOBILE_SSO_CALLBACK_PATH, getRequestURL(event).origin)
  try {
    const token = getCookie(event, (await auth.$context).authCookies.sessionToken.name) ?? ''
    const code = await parkMobileSsoToken(db, { state, challenge, token })
    target.searchParams.set('state', state)
    target.searchParams.set('code', code)
  } catch {
    // Never echo the reason: the app only needs to know the round trip failed,
    // and a public endpoint should not narrate its internals.
    target.searchParams.set('state', isOpaqueNonce(state) ? state : '')
    target.searchParams.set('error', 'sso_failed')
  }
  return sendRedirect(event, target.toString(), 302)
})

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Mobile SSO callback',
    description:
      'Redirect target for the native app\'s SSO sign-in. Parks the session bearer behind a single-use exchange code and redirects to the app\'s verified deep link with ?state&code (or ?state&error).',
    parameters: [
      { in: 'query', name: 'state', required: true, description: 'Opaque nonce the app generated.', schema: { type: 'string' } },
      { in: 'query', name: 'challenge', required: true, description: 'base64url SHA-256 of the app\'s exchange verifier.', schema: { type: 'string' } },
    ],
    responses: { '302': { description: 'Redirect to the app deep link.' } },
  },
})
