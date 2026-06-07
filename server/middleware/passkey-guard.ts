import { requireUser } from '../utils/auth-guards'
import { checkReauth } from '../utils/auth/reauth'

// Registering a NEW passkey grants account access - require a fresh password
// (+2FA) confirmation first. Sign-in endpoints stay open.
const GUARDED = ['/api/auth/passkey/generate-register-options', '/api/auth/passkey/verify-registration']

export default defineEventHandler(async (event) => {
  if (!GUARDED.some((p) => event.path.startsWith(p))) return
  const user = await requireUser(event)
  if (!checkReauth(getCookie(event, 'ng_reauth'), user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'confirm your password before adding a passkey' })
  }
})
