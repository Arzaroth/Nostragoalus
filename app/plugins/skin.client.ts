import { resolveSkin } from '~/utils/skins'

// Boot the cosmetic-skin state from localStorage (the anti-FOUC head script has
// already applied data-skin pre-paint; apply() here reconciles state and strips
// any stale/invalid value).
export default defineNuxtPlugin(() => {
  const { skin, unlocked, pronoRevealed, apply } = useSkin()
  skin.value = resolveSkin(localStorage.getItem('skin'))
  unlocked.value = localStorage.getItem('skinsUnlocked') === '1'
  pronoRevealed.value = localStorage.getItem('pronoRevealed') === '1'
  apply()
})
