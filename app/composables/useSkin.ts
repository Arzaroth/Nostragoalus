import type { SkinId } from '~/utils/skins'
import { resolveSkin } from '~/utils/skins'

// Shared client state for the cosmetic skins. `skin` is the active variant
// (null = default theme), `unlocked` gates the preferences picker, and bumping
// `celebrate` cues the one-shot unlock animation. State is `useState` so the
// konami trigger (app.vue), the picker (preferences), and the logo all read the
// same source. Persistence rides on better-auth additionalFields via updateUser.
export function useSkin() {
  const skin = useState<SkinId | null>('skin', () => null)
  const unlocked = useState<boolean>('skins-unlocked', () => false)
  const celebrate = useState<number>('skins-celebrate', () => 0)
  // One-time: the header wordmark has been hover-revealed as "My Little Prono".
  const pronoRevealed = useState<boolean>('prono-revealed', () => false)
  const { updateUser } = useAuth()

  function apply() {
    if (!import.meta.client) return
    const el = document.documentElement
    if (skin.value) el.dataset.skin = skin.value
    else delete el.dataset.skin
  }

  async function persist(fields: Record<string, unknown>) {
    // Cosmetic only and a no-op when signed out, so a failed/rejected save must
    // never bubble up as an error.
    try {
      await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)(fields)
    } catch {
      // ignore
    }
  }

  // Choose a skin (or null for the default). Empty string clears the saved
  // value account-side - resolveSkin treats it as the default anyway.
  function setSkin(next: SkinId | null) {
    skin.value = next
    if (import.meta.client) {
      if (next) localStorage.setItem('skin', next)
      else localStorage.removeItem('skin')
    }
    apply()
    void persist({ skin: next ?? '' })
  }

  // Konami trigger. Unlock is monotonic (you can't re-lock), so this only ever
  // flips the gate on and fires one celebration.
  function unlock() {
    if (unlocked.value) return
    unlocked.value = true
    celebrate.value += 1
    if (import.meta.client) localStorage.setItem('skinsUnlocked', '1')
    void persist({ skinsUnlocked: true })
  }

  // Restore from the signed-in user's saved values. Never downgrades the unlock
  // gate (monotonic), and applies the saved skin when it differs.
  function hydrate(user: { skin?: unknown; skinsUnlocked?: unknown } | null | undefined) {
    if (!user) return
    if (user.skinsUnlocked === true) unlocked.value = true
    const next = resolveSkin(user.skin)
    if (next !== skin.value) {
      skin.value = next
      apply()
    }
  }

  // Reveal the wordmark for this session only - it stays "My Little Prono"
  // until a reload (not persisted), so the magic replays on the next visit.
  function revealProno() {
    pronoRevealed.value = true
  }

  return { skin, unlocked, celebrate, pronoRevealed, setSkin, unlock, apply, hydrate, revealProno }
}
