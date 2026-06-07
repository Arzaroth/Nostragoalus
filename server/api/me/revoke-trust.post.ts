import { requireUser } from '../../utils/auth-guards'

// Forget the "trust this device" cookie for THIS browser, so the next sign-in
// asks for the second factor again. (Trust is cookie-based, per device.)
export default defineEventHandler(async (event) => {
  await requireUser(event)
  deleteCookie(event, 'better-auth.trust_device')
  deleteCookie(event, '__Secure-better-auth.trust_device')
  return { ok: true }
})
