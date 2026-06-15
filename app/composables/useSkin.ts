import type { SkinId } from '~/utils/skins'
import { resolveSkin } from '~/utils/skins'

// Shared client state for the cosmetic skins. `skin` is the active variant
// (null = default theme), `unlocked` gates the preferences picker, and bumping
// `celebrate` cues the one-shot unlock animation.
//
// The active skin is persisted in a COOKIE (not localStorage) so the server
// reads it and renders the right logo + palette on the first paint - no
// default-then-skin flash. The cookie seeds a shared useState (the reactive
// source every consumer reads); setSkin writes both. Account sync still rides
// on better-auth additionalFields via updateUser.
export function useSkin() {
  const skinCookie = useCookie<string | null>('ng-skin', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => null,
  })
  const skin = useState<SkinId | null>('skin', () => resolveSkin(skinCookie.value))
  const unlocked = useState<boolean>('skins-unlocked', () => false)
  const celebrate = useState<number>('skins-celebrate', () => 0)
  // One-time, session-only (not persisted): the header wordmark has been
  // hover-revealed as "My Little Prono".
  const pronoRevealed = useState<boolean>('prono-revealed', () => false)
  const { updateUser } = useAuth()

  async function persist(fields: Record<string, unknown>) {
    // Cosmetic only and a no-op when signed out, so a failed/rejected save must
    // never bubble up as an error.
    try {
      await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)(fields)
    } catch {
      // ignore
    }
  }

  // Choose a skin (or null for the default). Writes the reactive state + the
  // cookie, and syncs the account. Empty string clears the saved account value
  // - resolveSkin treats it as the default anyway.
  function setSkin(next: SkinId | null) {
    skin.value = next
    skinCookie.value = next
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

  // Reveal the wordmark for this session only (replays on the next reload).
  function revealProno() {
    pronoRevealed.value = true
  }

  // Restore from the signed-in user's saved values. Never downgrades the unlock
  // gate (monotonic), and applies the saved skin when it differs.
  function hydrate(user: { skin?: unknown; skinsUnlocked?: unknown } | null | undefined) {
    if (!user) return
    if (user.skinsUnlocked === true) unlocked.value = true
    const next = resolveSkin(user.skin)
    if (next !== skin.value) {
      skin.value = next
      skinCookie.value = next
    }
  }

  return { skin, unlocked, celebrate, pronoRevealed, setSkin, unlock, revealProno, hydrate }
}
