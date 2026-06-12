import { authClient } from '../../lib/auth-client'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/two-factor', '/about', '/license', '/roadmap', '/forgot-password', '/reset-password']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (PUBLIC_ROUTES.includes(to.path)) return

  const { data } = await authClient.getSession()
  if (!data) return navigateTo('/login')
})
