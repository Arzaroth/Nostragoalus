// Flags a stale client when Nuxt's build-manifest poll sees a new deploy;
// the UpdateBanner offers the reload instead of forcing one mid-prediction.
export default defineNuxtPlugin((nuxtApp) => {
  const outdated = useState('outdated-build', () => false)
  nuxtApp.hook('app:manifest:update', () => {
    outdated.value = true
  })
})
