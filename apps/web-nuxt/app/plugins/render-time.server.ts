// Measures how long the server spent rendering this page and ships it in the
// payload for the footer's "Page: NNms" (Forgejo-style). Client-side
// navigations are timed in the footer itself via router hooks.
export default defineNuxtPlugin((nuxtApp) => {
  const start = Date.now()
  nuxtApp.hook('app:rendered', () => {
    ;(nuxtApp.payload as { renderMs?: number }).renderMs = Date.now() - start
  })
})
