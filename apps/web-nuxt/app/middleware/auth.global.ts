import { authClient } from '../../lib/auth-client'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/two-factor', '/about', '/license', '/roadmap', '/forgot-password', '/reset-password', '/verify-email', '/verify', '/418', '/500']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (PUBLIC_ROUTES.includes(to.path)) return
  // Invite landing page renders a league preview to signed-out users and
  // bounces them through login itself (carrying ?next), so don't pre-redirect.
  if (to.path.startsWith('/leagues/join/')) return
  // Share-card landings are public and crawler-facing (the whole point is
  // sending them to signed-out friends): per-pick (/s/), profile (/p/) and
  // personal-analytics (/a/) cards.
  if (to.path.startsWith('/s/')) return
  if (to.path.startsWith('/p/')) return
  if (to.path.startsWith('/a/')) return

  // getSession() returns { data, error } and does NOT throw on a failed request.
  // On mobile/roaming 4G the fetch can fail (packet loss, CGNAT drop, tower
  // handoff) with a still-valid cookie. Treating that null `data` as logged-out
  // bounced the user to /login mid-session; only redirect on a real "no
  // session" (data null, no transport error). A genuinely expired cookie is
  // caught by the actual API call the page makes.
  const { data, error } = await authClient.getSession()
  if (error) return
  if (!data) return navigateTo('/login')
})
