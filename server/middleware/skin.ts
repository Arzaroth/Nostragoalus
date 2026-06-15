import { getSessionUser } from '../utils/auth-guards'

// Seed the active skin from the signed-in user's account during SSR so the
// first paint renders the right logo + palette (no default-then-skin flash)
// even before the ng-skin cookie exists. Only runs for page documents that
// don't already carry the cookie, so it adds at most one session lookup on a
// signed-in user's first visit (useSkin then stamps the cookie).
export default defineEventHandler(async (event) => {
  if (getCookie(event, 'ng-skin')) return
  const path = event.path
  if (path.startsWith('/api') || path.startsWith('/_') || path.startsWith('/skins') || path.includes('.')) return
  const user = (await getSessionUser(event).catch(() => null)) as { skin?: unknown } | null
  if (user?.skin) event.context.skin = user.skin
})
