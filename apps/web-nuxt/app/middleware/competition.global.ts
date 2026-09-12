// Redirect legacy un-prefixed competition pages (/matches, /bracket, …) to the
// path-prefixed form (/<last-competition>/matches) so old links keep working.
const LEGACY = new Set(['matches', 'bracket', 'map', 'leaderboard', 'teams', 'users'])

export default defineNuxtRouteMiddleware(async (to) => {
  const seg = to.path.split('/')[1]
  if (LEGACY.has(seg)) {
    const last = useLastCompetition()
    return navigateTo(`/${last.value}${to.fullPath}`, { replace: true })
  }

  // Garbage slugs should 404, not render an empty shell of a valid-looking page.
  const slug = to.params.competition as string | undefined
  if (slug) {
    // can't validate (API down) - let the page render rather than block navigation
    const meta = await ensureCompetitionMeta()
    if (!meta) return
    if (!meta.slugs.includes(slug)) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }
  }
})
