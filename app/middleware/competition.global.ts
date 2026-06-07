// Redirect legacy un-prefixed competition pages (/matches, /bracket, …) to the
// path-prefixed form (/<last-competition>/matches) so old links keep working.
const LEGACY = new Set(['matches', 'bracket', 'map', 'leaderboard', 'predictions', 'teams', 'users'])

export default defineNuxtRouteMiddleware(async (to) => {
  const seg = to.path.split('/')[1]
  if (LEGACY.has(seg)) {
    const last = useLastCompetition()
    return navigateTo(`/${last.value}${to.fullPath}`, { replace: true })
  }

  // Garbage slugs should 404, not render an empty shell of a valid-looking page.
  const slug = to.params.competition as string | undefined
  if (slug) {
    const known = useState<string[] | null>('competition-slugs', () => null)
    if (!known.value) {
      try {
        const res = await $fetch<{ competitions: { slug: string }[] }>('/api/competitions')
        known.value = res.competitions.map((c) => c.slug)
      } catch {
        return // can't validate (API down) — let the page render rather than block navigation
      }
    }
    if (!known.value.includes(slug)) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }
  }
})
