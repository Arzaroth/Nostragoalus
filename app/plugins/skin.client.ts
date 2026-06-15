// The active skin is cookie-seeded (SSR-correct), so only the konami unlock
// gate needs restoring from localStorage on boot.
export default defineNuxtPlugin(() => {
  const { unlocked } = useSkin()
  unlocked.value = localStorage.getItem('skinsUnlocked') === '1'
})
