# Right-to-left (RTL)

Arabic (`ar`) is the first right-to-left locale. The app is written to be
**direction-agnostic**: the same components mirror automatically when the
document direction flips. This doc is the how.

## Document direction

`apps/web-nuxt/nuxt.config.ts` gives each locale a `language` (BCP47) and gives `ar`
`dir: 'rtl'`. `apps/web-nuxt/app/app.vue` binds `<html lang>` and `<html dir>` off the **active
locale object** (from `useI18n().locales`), because both fields ride the SSR
payload, so server and client agree and RTL is correct on the first paint:

```ts
const { locale, locales } = useI18n()
const activeLocale = computed(() => locales.value.find((l) => l.code === locale.value))
useHead({ htmlAttrs: {
  lang: computed(() => activeLocale.value?.language ?? locale.value),
  dir: computed(() => activeLocale.value?.dir ?? 'ltr'),
} })
```

Gotcha (why not `useLocaleHead`): `@nuxtjs/i18n`'s `useLocaleHead()` emits `dir`
only on the server, so binding to it drops the attribute on hydration and the
page flips LTR->RTL after first paint. Binding to the locale object avoids that.

## CSS: physical -> logical

The layout mirrors because directional CSS is **logical**, not physical. UnoCSS
`presetWind3` generates the logical utilities; the convention:

| physical (do not use) | logical (use) |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r` | `border-s` / `border-e` |
| raw `left`/`right`/`margin-left`/`border-left` | `inset-inline-start/end`, `margin-inline-start`, `border-inline-*` |

Flex/grid already mirror under `dir=rtl` (main-start flips), so `justify-between`,
`flex-row`, `gap`, etc. need no change. A new component should use logical
utilities and it mirrors for free.

### Deliberately left physical

Not everything should mirror - flipping these would be wrong:

- **Centering**: `left-1/2 -translate-x-1/2` is symmetric; leave it.
- **The world map** (`WorldMap.vue`) - real geography, must not mirror.
- **Pitch coordinates** (`MatchLineups.vue`, `left: {x}%`) - a football pitch.
- Symmetric pairs (the scroll edge-fades on both sides of the topbar).

## The knockout bracket

`pages/[competition]/bracket.vue` is a symmetric flex tree
`[left half][center final][right half]`. Under `dir=rtl` the flex halves swap on
their own (the FIFA-style "reversed" look), and the connector elbows (scoped-CSS
`::before`/`::after`) mirror because their geometry was converted to logical
(`inset-inline-*`, `border-inline-*`). Result: the whole tree flips, the final
stays centered, elbows still converge inward, cards flip (flag on the trailing
side). Identical under LTR. Matches FIFA's own Arabic bracket.

## Icons

Directional glyphs (back/forward arrows, chevrons) are font glyphs, so a global
rule in `apps/web-nuxt/app/assets/css/main.css` flips them under RTL:

```css
[dir='rtl'] .pi-arrow-left, [dir='rtl'] .pi-arrow-right,
[dir='rtl'] .pi-chevron-left, ... { display: inline-block; transform: scaleX(-1); }
```

## Share cards

The satori share card stays **LTR** (a score graphic - home left, away right, a
universal convention). Arabic **glyphs** still render: the card's font fallback
(`apps/web-nuxt/server/utils/share/og-assets.ts`, `SCRIPT_FAMILY` maps `ar` to `Noto Sans
Arabic`) already fetches Noto Sans Arabic on demand for Arabic text. Bundling
`NotoSansArabic-*.woff` alongside
the Thai fonts (for offline reliability, like Thai) is a deferred nicety (see
[TODO.md](../../TODO.md)).

## Tests

`apps/web-nuxt/tests/e2e/rtl.e2e.ts` (Playwright) asserts: default renders `dir=ltr`, the
`ng_locale=ar` cookie renders `dir=rtl` in the SSR markup, and the footer
switcher flips the live document to `rtl`.

Dev-server caveat: the HMR dev server can corrupt its `@nuxtjs/i18n` SSR state
after locale-churn/edits (dir/cookie detection goes stale); a container
`--force-recreate` restores it. A production build is unaffected.

## Sources

- `apps/web-nuxt/nuxt.config.ts` (per-locale `dir`/`language`), `apps/web-nuxt/app/app.vue` (`<html>` binding)
- `apps/web-nuxt/app/assets/css/main.css` (icon-flip rule)
- `apps/web-nuxt/app/pages/[competition]/bracket.vue`, `apps/web-nuxt/app/components/BracketMatchCard.vue`
- `apps/web-nuxt/tests/e2e/rtl.e2e.ts`
- [i18n.md](i18n.md)
