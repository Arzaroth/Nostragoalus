// Resolves the competition slug set and the admin-set default during SSR, so the
// first render (and the hydrated client, via the payload) already knows which
// competition a slug-less link should point at. Without this the cookie default
// and every un-prefixed page would fall back to the compiled-in constant until
// some other fetch happened to land.
export default defineNuxtPlugin(async () => {
  await ensureCompetitionMeta()
})
