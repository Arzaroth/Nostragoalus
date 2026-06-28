# Easter eggs

Hidden, surprise features. These are documented here (the brain is internal dev
documentation) but kept out of the public CHANGELOG, ROADMAP, roadmap-seed, and
about page so the surprise survives for end users.

## "My Little Prono" themes (konami)

The konami code permanently unlocks a set of six pony skins, then selectable from
preferences. The name is a My Little Pony pun on "Mon Petit Prono".

- Skin ids (`app/utils/skins.ts`, covered by the gate): `twilight`, `rainbow`,
  `pinkie`, `applejack`, `rarity`, `fluttershy`.
- A skin is ORTHOGONAL to light/dark. Two better-auth additionalFields back it:
  `user.skin` and `user.skinsUnlocked`.
- Persistence is the `ng-skin` cookie (not localStorage). The server reads the
  cookie so SSR paints the right logo and palette on first paint, with no
  default-to-skin flash. `setSkin` writes the cookie, a shared `useState`, and
  the account. For signed-in users `server/middleware/skin.ts` seeds
  `event.context.skin` from the account when the cookie is absent.
- The palette is applied via `data-skin` on `<html>` (SSR-rendered, reactive) - an
  unlayered `[data-skin]` block overrides the PrimeUix `--p-primary-*` tokens.
- The konami sequence is detected with `@tanstack/vue-hotkeys`
  (`useKonamiUnlock()`); unlocking fires a one-shot `SkinUnlockCelebration.vue`
  confetti.
- With a skin on, hovering the wordmark reveals "My Little Prono" with a rainbow
  shimmer (session-only). The header logo becomes crystal-ball SVG variants; the
  banner art becomes pony-head photos in `public/skins/<id>.png`.
- The `ng-skin` cookie is allowlist-validated via `resolveSkin` / `isSkinId`
  before any SSR DOM use, and a better-auth `update.before` hook coerces a
  non-allowlisted `skin` to null. So there is no injection surface.

Added via migration 0027.

## Pony match reactions

When a skin is active, `ReactionBar.vue` swaps the six [match reaction](reactions.md)
emoji for the mane-six heads (the same `public/skins/<id>.png` assets), with a
fixed mapping independent of the selected skin: FIRE -> rainbow, GOAL -> applejack,
WOW -> twilight, LAUGH -> pinkie, SAD -> fluttershy, ANGRY -> rarity. The swap is
display-only; the stored reaction enum key is unchanged. The public palette
(fire, goal, wow, laugh, sad, angry glyphs) is what end users normally see.

## Klingon locale

The fourth locale, `tlh` (Klingon), is itself an in-character easter egg. The
strings are kept terse and in-character. It is a real locale file
(`i18n/locales/tlh.json`) so it is required code, unlike the skins. See
[../architecture/i18n.md](../architecture/i18n.md).

## Sources

- `app/utils/skins.ts`, `app/composables/useSkin.ts`, `useKonamiUnlock.ts`
- `server/middleware/skin.ts`, `lib/auth.ts` (skin additionalFields + update hook)
- `app/components/ReactionBar.vue`, `public/skins/*`, `i18n/locales/tlh.json`
