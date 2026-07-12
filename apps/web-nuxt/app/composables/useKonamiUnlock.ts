import { useHotkeySequence } from '@tanstack/vue-hotkeys'
import type { HotkeySequence } from '@tanstack/vue-hotkeys'

// The Konami code unlocks the cosmetic skins. Sequence matching (timeout,
// mistype recovery, case-folded letters) is handled by the hotkeys library;
// this is just the trigger. Mount once globally (app.vue).
const KONAMI: HotkeySequence = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'B',
  'A',
]

export function useKonamiUnlock() {
  const { unlock } = useSkin()
  useHotkeySequence(KONAMI, () => {
    unlock()
  })
}
