import { authClient } from '../../lib/auth-client'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/two-factor', '/about', '/license', '/roadmap', '/forgot-password', '/reset-password', '/verify-email', '/418', '/500']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (PUBLIC_ROUTES.includes(to.path)) return
  // Invite landing page renders a league preview to signed-out users and
  // bounces them through login itself (carrying ?next), so don't pre-redirect.
  if (to.path.startsWith('/leagues/join/')) return

  const { data } = await authClient.getSession()
  if (!data) return navigateTo('/login')
})
