# Easter eggs

Hidden, surprise features. These are documented here (the brain is internal dev
documentation) but kept out of the public CHANGELOG, ROADMAP, roadmap-seed, and
about page so the surprise survives for end users.

## "My Little Prono" themes (konami)

The konami code permanently unlocks a set of six pony skins, then selectable from
preferences. The name is a My Little Pony pun on "Mon Petit Prono".

- Skin ids (`apps/web-nuxt/app/utils/skins.ts`, covered by the gate): `twilight`, `rainbow`,
  `pinkie`, `applejack`, `rarity`, `fluttershy`.
- A skin is ORTHOGONAL to light/dark. Two better-auth additionalFields back it:
  `user.skin` and `user.skinsUnlocked`.
- Persistence is the `ng-skin` cookie (not localStorage). The server reads the
  cookie so SSR paints the right logo and palette on first paint, with no
  default-to-skin flash. `setSkin` writes the cookie, a shared `useState`, and
  the account. For signed-in users `apps/web-nuxt/server/middleware/skin.ts` seeds
  `event.context.skin` from the account when the cookie is absent.
- The palette is applied via `data-skin` on `<html>` (SSR-rendered, reactive) - an
  unlayered `[data-skin]` block overrides the PrimeUix `--p-primary-*` tokens.
- The konami sequence is detected with `@tanstack/vue-hotkeys`
  (`useKonamiUnlock()`); unlocking fires a one-shot `SkinUnlockCelebration.vue`
  confetti.
- With a skin on, hovering the wordmark reveals "My Little Prono" with a rainbow
  shimmer (session-only). The header logo becomes crystal-ball SVG variants; the
  banner art becomes pony-head photos in `apps/web-nuxt/public/skins/<id>.png`.
- The `ng-skin` cookie is allowlist-validated via `resolveSkin` / `isSkinId`
  before any SSR DOM use, and a better-auth `update.before` hook coerces a
  non-allowlisted `skin` to null. So there is no injection surface.

Added via migration 0027.

Unlocking the skins also grants a hidden, GLOBAL [achievement](achievements.md)
(`the-magic-word`): the better-auth `user.update` `after` hook in `apps/web-nuxt/lib/auth.ts`
calls `grantAchievement` when `skinsUnlocked` first turns true (idempotent, fires
one `ACHIEVEMENT_UNLOCKED`). It is `hidden` in the catalog, so it never shows as a
locked slot in anyone's cabinet - only once earned - and its i18n copy is kept
cryptic so the trigger isn't spoiled. Like the rest of this page, it stays out of
the public changelog/roadmap/about.

## Pony match reactions

When a skin is active, `ReactionGlyph.vue` (the shared per-face component behind
the match `ReactionBar` and chat message reactions) renders the mane-six heads
instead of the six [match reaction](reactions.md) emoji (the same
`apps/web-nuxt/public/skins/<id>.png` assets); `MatchReactionsLine.vue`, the compact match-list
line, carries its own copy of the swap. The mapping is fixed, independent of the
selected skin: FIRE -> rainbow, GOAL -> applejack,
WOW -> twilight, LAUGH -> pinkie, SAD -> fluttershy, ANGRY -> rarity. The swap is
display-only; the stored reaction enum key is unchanged. The public palette
(fire, goal, wow, laugh, sad, angry glyphs) is what end users normally see.

## Klingon locale

The fourth locale, `tlh` (Klingon), is itself an in-character easter egg. The
strings are kept terse and in-character. It is a real locale file
(`shared/i18n-json/tlh.json`) so it is required code, unlike the skins. See
[../architecture/i18n.md](../architecture/i18n.md).

## Sources

- `apps/web-nuxt/app/utils/skins.ts`, `apps/web-nuxt/app/composables/useSkin.ts`, `useKonamiUnlock.ts`
- `apps/web-nuxt/server/middleware/skin.ts`, `apps/web-nuxt/lib/auth.ts` (skin additionalFields + update hook)
- `apps/web-nuxt/app/components/ReactionGlyph.vue`, `apps/web-nuxt/app/components/MatchReactionsLine.vue`,
  `apps/web-nuxt/public/skins/*`, `shared/i18n-json/tlh.json`
