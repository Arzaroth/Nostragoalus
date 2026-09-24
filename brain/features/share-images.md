# Share images

Prediction share cards rendered server-side as PNGs, for social previews and
sharing. The rendering stack (satori HTML/CSS -> SVG, then @resvg/resvg-js
SVG -> PNG) and its font / asset footguns are documented in
[../architecture/rendering.md](../architecture/rendering.md); this page covers the
feature wiring.

## Flow

1. `POST /api/share/mint` checks ownership of the prediction and returns a
   stateless HMAC token naming the prediction, card mode and locale. It goes
   through the shared signed-token codec
   (`apps/web-nuxt/server/utils/signed-token/codec.ts`, also behind the calendar
   feeds), whose signing key is domain-separated from the auth secret; the share
   tag and payload live in `apps/web-nuxt/server/utils/share/token.ts`. Tokens
   expire after 180 days (`SHARE_TTL_SECONDS`); a token minted before expiry
   existed carries no expiry and stays valid.
2. `GET /og/share/[token]` is public: it verifies the signed token and renders
   the card. The mint step is the authorization boundary; the render trusts the
   token. This route is outside the coverage gate (it returns a binary).
3. The link people share is the `/s/[token]` landing page, which reads the JSON
   summary `GET /api/share/[token]` for its heading and SEO meta and points
   `og:image` at the PNG.

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

Team identity on the card is a CODE pill (for example ENG, SEN) plus the FIFA
flag. satori cannot fetch remote images, so the OG route fetches each flag once,
inlines it as a data URI and caches it for the process; a failed fetch resolves to
null and the card falls back to the code pill alone, so a flaky CDN never breaks
the render.

## Caching

The result state is cached 1 day (`max-age=86400`, immutable once final); live
and pre-kickoff states use a short cache (120s) since they change.

## Sibling cards (wrapped, profile, analytics)

The same satori + resvg stack serves three user-scoped cards. They all name a
`{user, competition, locale}` and differ only in their domain-separation tag, so
they share one token codec, `createUserCompetitionCardCodec(domainTag)`
(`apps/web-nuxt/server/utils/share/card-token.ts`); `wrapped-token.ts`, `profile-token.ts` and
`analytics-token.ts` are thin wrappers over it. A token minted for one family
never validates as another.

- **Wrapped** (`/og/wrapped/[token]`, minted by `wrapped-mint.post.ts`,
  `wrapped-template.ts`): the post-final recap card; 404s until the final is
  decided, then cached 1 day. Image-only, minted from the wrapped page.
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

- `apps/web-nuxt/server/utils/share/{token,card,template,render,og-assets,font-fallback,i18n}.ts`,
  `apps/web-nuxt/server/utils/signed-token/codec.ts`,
  `apps/web-nuxt/server/routes/og/share/[token].get.ts`
- `apps/web-nuxt/shared/share-card.ts`, `apps/web-nuxt/server/api/share/{mint.post,[token].get}.ts`,
  `apps/web-nuxt/app/pages/s/[token].vue`
- Sibling cards: `apps/web-nuxt/server/utils/share/{card-token,wrapped-token,wrapped-template,profile-token,profile-card,profile-template,analytics-token,analytics-card,analytics-template}.ts`,
  `apps/web-nuxt/server/routes/og/{wrapped,profile,analytics}/[token].get.ts`,
  `apps/web-nuxt/server/api/share/{wrapped-mint,profile-mint,analytics-mint}.post.ts`,
  `apps/web-nuxt/server/api/share/{profile,analytics}/[token].get.ts`,
  `apps/web-nuxt/app/pages/{p,a}/[token].vue`
- Rendering details: [../architecture/rendering.md](../architecture/rendering.md)
