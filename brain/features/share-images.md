# Share images

Prediction share cards rendered server-side as PNGs, for social previews and
sharing. The rendering stack (satori HTML/CSS -> SVG, then @resvg/resvg-js
SVG -> PNG) and its font / asset footguns are documented in
[../architecture/rendering.md](../architecture/rendering.md); this page covers the
feature wiring.

## Flow

1. `POST /api/share/mint` checks ownership of the prediction and returns a
   stateless HMAC token. The signing secret is domain-separated from the auth
   secret (`server/utils/share/token.ts`).
2. `GET /og/share/[token]` is public: it verifies the signed token and renders
   the card. The mint step is the authorization boundary; the render trusts the
   token. This route is outside the coverage gate (it returns a binary).

## Card model + states

The card has three states - prediction, live, and result - built from the match
plus the user's pick. The model lives in `shared/share-card.ts`; the pure element
template and the render live in `server/utils/share/` (under the 98% gate).

Team identity on the card is rendered as CODE pills (for example ENG, SEN), not
FIFA-CDN flag images, to avoid a render-time network dependency and failure mode.

## Caching

The result state is cached around 1 day (immutable once final); live and
pre-kickoff states use a short cache (around 120s) since they change.

The same satori + resvg stack is intended to serve Tournament Wrapped and sibling
share cards.

## Sources

- `server/utils/share/{token,card,template,render}.ts`,
  `server/routes/og/share/[token].get.ts`
- `shared/share-card.ts`, `server/api/share/mint.post.ts`
- Rendering details: [../architecture/rendering.md](../architecture/rendering.md)
