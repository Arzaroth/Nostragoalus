// Cosmetic "skin" variants behind a konami easter egg. A skin overrides the
// PrimeVue primary palette (assets/css/skins.css, keyed on [data-skin]) and
// swaps the logo mark. Persisted per-user as user.skin and gated behind
// user.skinsUnlocked.

export const SKIN_IDS = ['twilight', 'rainbow', 'pinkie', 'applejack', 'rarity', 'fluttershy'] as const
export type SkinId = (typeof SKIN_IDS)[number]

export interface SkinMeta {
  id: SkinId
  // Picker preview chip - mirrors the --p-primary-500 step in skins.css.
  swatch: string
  // Rainbow Dash gets a multi-stop chip instead of the flat swatch.
  rainbow?: boolean
}

export const SKINS: readonly SkinMeta[] = [
  { id: 'rainbow', swatch: '#0ea5e9', rainbow: true },
  { id: 'pinkie', swatch: '#ec4899' },
  { id: 'twilight', swatch: '#8b5cf6' },
  { id: 'applejack', swatch: '#f97316' },
  { id: 'rarity', swatch: '#a855f7' },
  { id: 'fluttershy', swatch: '#f59e0b' },
]

const SKIN_SET: ReadonlySet<string> = new Set(SKIN_IDS)

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKIN_SET.has(value)
}

// Normalize any stored value (DB column, localStorage, session) to a known
// skin id or null - null is the default (un-skinned) theme.
export function resolveSkin(value: unknown): SkinId | null {
  return isSkinId(value) ? value : null
}

export function skinsUnlocked(user: unknown): boolean {
  return (user as { skinsUnlocked?: boolean | null } | null | undefined)?.skinsUnlocked === true
}

export function userSkin(user: unknown): SkinId | null {
  return resolveSkin((user as { skin?: unknown } | null | undefined)?.skin)
}
