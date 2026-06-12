// Flags a stale client when Nuxt's build-manifest poll sees a new deploy;
// the UpdateBanner offers the reload instead of forcing one mid-prediction.
export default defineNuxtPlugin((nuxtApp) => {
  const outdated = useState('outdated-build', () => false)
  const dismissed = useState('update-dismissed', () => false)
  nuxtApp.hook('app:manifest:update', () => {
    outdated.value = true
    // A fresh deploy re-surfaces the banner even if an earlier one was
    // dismissed, so a long-lived tab can't ride a stale bundle all tournament.
    dismissed.value = false
  })
})
