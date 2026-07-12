# Share images

Prediction share cards rendered server-side as PNGs, for social previews and
sharing. The rendering stack (satori HTML/CSS -> SVG, then @resvg/resvg-js
SVG -> PNG) and its font / asset footguns are documented in
[../architecture/rendering.md](../architecture/rendering.md); this page covers the
feature wiring.

## Flow

1. `POST /api/share/mint` checks ownership of the prediction and returns a
   stateless HMAC token. The signing secret is domain-separated from the auth
   secret (`apps/web-nuxt/server/utils/share/token.ts`).
2. `GET /og/share/[token]` is public: it verifies the signed token and renders
   the card. The mint step is the authorization boundary; the render trusts the
   token. This route is outside the coverage gate (it returns a binary).

## Card model + states

The card has four states - `sealed`, `reveal`, `live`, and `result` - derived
from match timing plus scoring (not taken verbatim from the token): pre-kickoff
it is `sealed` unless the owner minted a `reveal`, flips to `live` once kickoff
passes, then `result` when the match is finished and scored. The state machine
and card model live in `apps/web-nuxt/server/utils/share/card.ts`; the pure element template
(`template.ts`) and the satori/resvg render (`render.ts`) sit alongside, under the
98% gate. The shared pure helpers (round label, tier palette, score format, flag
URL) live in `apps/web-nuxt/shared/share-card.ts`, used by both this server template and the
client `ShareCardView.vue` so the two renderers can't drift.

Team identity on the card is rendered as CODE pills (for example ENG, SEN), not
FIFA-CDN flag images, to avoid a render-time network dependency and failure mode.

## Caching

The result state is cached around 1 day (immutable once final); live and
pre-kickoff states use a short cache (around 120s) since they change.

## Sibling cards (wrapped, profile, analytics)

The same satori + resvg stack serves three user-scoped cards. They all name a
`{user, competition, locale}` and differ only in their domain-separation tag, so
they share one token codec, `createUserCompetitionCardCodec(domainTag)`
(`apps/web-nuxt/server/utils/share/card-token.ts`); `wrapped-token.ts`, `profile-token.ts` and
`analytics-token.ts` are thin wrappers over it. A token minted for one family
never validates as another.

- **Wrapped** (`/og/wrapped/[token]`, minted by `wrapped-mint.post.ts`): the
  post-final recap card; 404s until the final is decided. Image-only, minted from
  the wrapped page.
- **Profile** (`/og/profile/[token]`, `profile-mint.post.ts`,
  `profile-card.ts` + `profile-template.ts`): rank, points, exacts and the
  trophy/badge haul. Works mid-tournament (no gate). Landing page `/p/[token]`.
- **Analytics** (`/og/analytics/[token]`, `analytics-mint.post.ts`,
  `analytics-card.ts` + `analytics-template.ts`): the bias-detector headline
  numbers (accuracy, exact rate, goal lean, home bias), reusing the
  userId-parameterized `getAnalytics`. 404s until the user has a scored pick
  (`hasData`). Landing page `/a/[token]`.

Each mint is owner-only (the token names only the caller), so a card is reachable
only by the link its owner chooses to share - no public handle, nothing crawlable
by default. The `/p/` and `/a/` landings are in the auth-middleware public
allowlist (like `/s/`) so a signed-out friend can open them; each resolves the
origin once at setup and sets `og:image` to the PNG so the link unfurls. Both use
a short (~5min) cache since the standing/report shifts as matches score. The
per-card JSON summaries (`/api/share/profile/[token]`, `/api/share/analytics/
[token]`) feed the landing headings + SEO meta.

## Sources

- `apps/web-nuxt/server/utils/share/{token,card,template,render}.ts`,
  `apps/web-nuxt/server/routes/og/share/[token].get.ts`
- `apps/web-nuxt/shared/share-card.ts`, `apps/web-nuxt/server/api/share/mint.post.ts`
- Sibling cards: `apps/web-nuxt/server/utils/share/{card-token,profile-token,profile-card,profile-template,analytics-token,analytics-card,analytics-template}.ts`,
  `apps/web-nuxt/server/routes/og/{profile,analytics}/[token].get.ts`, `apps/web-nuxt/server/api/share/{profile-mint,analytics-mint}.post.ts`,
  `apps/web-nuxt/app/pages/{p,a}/[token].vue`
- Rendering details: [../architecture/rendering.md](../architecture/rendering.md)
