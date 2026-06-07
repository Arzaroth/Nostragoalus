import { requireUser } from '../../utils/auth-guards'

// The trust cookie is HttpOnly; report its presence so the UI can reflect it.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const trusted = !!(getCookie(event, 'better-auth.trust_device') || getCookie(event, '__Secure-better-auth.trust_device'))
  return { trusted }
})
