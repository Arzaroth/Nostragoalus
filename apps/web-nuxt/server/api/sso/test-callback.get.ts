import { db } from '../../../db'
import { completeOidcTestSignIn } from '../../utils/sso/test-signin'

// JSON for embedding inside an inline <script>. JSON.stringify alone leaves
// `</script>` intact, so the attacker-controlled `state` reflected below would
// otherwise break out of the script element (reflected XSS on this public,
// unauthenticated endpoint). Neutralise the three HTML-significant characters
// that can end the script context.
function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

// Public OIDC redirect target for the admin test sign-in. It's secured by the
// single-use state nonce, NOT an admin session: the IdP redirect is a top-level
// popup navigation with no guaranteed cookies. It captures the claims server-side
// (the admin reads them through the admin-gated result route) and only posts a
// {testId, ok} signal back to the opener before closing - no claims in the URL or
// response body. It never creates a session.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const state = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code : ''
  let ok = false
  if (state && code) {
    try {
      ok = await completeOidcTestSignIn(db, state, code)
    } catch {
      ok = false
    }
  }
  const origin = getRequestURL(event).origin
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SSO test sign-in</title></head><body><script>
(function () {
  try {
    if (window.opener) window.opener.postMessage({ type: 'sso-test-result', testId: ${scriptSafeJson(state)}, ok: ${ok ? 'true' : 'false'} }, ${scriptSafeJson(origin)});
  } catch (e) {}
  window.close();
})();
</script><p>You can close this window and return to the admin console.</p></body></html>`
})

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'SSO test sign-in callback',
    description: 'Public OIDC redirect target for the admin dry-run test sign-in. Captures claims by the single-use state nonce; never creates a session.',
    responses: { '200': { description: 'HTML that posts the result to the opener and closes.' } },
  },
})
