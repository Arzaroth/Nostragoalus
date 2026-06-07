// Redirect legacy un-prefixed competition pages (/matches, /bracket, …) to the
// path-prefixed form (/<last-competition>/matches) so old links keep working.
const LEGACY = new Set(['matches', 'bracket', 'map', 'leaderboard', 'predictions', 'teams', 'users'])

export default defineNuxtRouteMiddleware((to) => {
  const seg = to.path.split('/')[1]
  if (LEGACY.has(seg)) {
    const last = useLastCompetition()
    return navigateTo(`/${last.value}${to.fullPath}`, { replace: true })
  }
})
