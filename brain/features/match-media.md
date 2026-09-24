# Match media (watch links)

Admin-curated Live, Replay and Highlights links attached to a match. Links from a
recognised video host play inline in a sandboxed iframe; anything else renders as
an "open in a new tab" button. They surface as tabs on the match page, as the
Stream view of a [multiview](multiview.md) cell, and as a list in the
[mobile app](mobile-app.md). Links are written by an admin in the UI or by a
machine client (the curation bot) holding a `media:write` API key. Shipped in
1.19.0, on top of the API-key clients from 1.18.0. Back to the catalog:
[index.md](index.md).

## Model

- One `match_media` row per link: `match_id` (cascade-deleted with the match),
  `kind` (`match_media_kind` enum: `LIVE` / `REPLAY` / `HIGHLIGHTS`), `url`,
  optional `label`, and three nullable admin overrides: `embeddable`, `sandbox`,
  `allow`. Indexed on `(match_id, kind)`. See
  [../architecture/database.md](../architecture/database.md).
- Null always means "use the default". The overrides are stored raw and resolved
  on read, so changing the host whitelist later moves every non-overridden link
  with it.
- The isomorphic rules live in `apps/web-nuxt/shared/match-media.ts`, shared by
  the server and the web client. The DB side is
  `apps/web-nuxt/server/utils/match-media/service.ts`. The GET response shape is
  part of the [cross-stack contract](../architecture/cross-stack-contract.md)
  the Flutter client is generated from.

## Embedding rules

- **https only.** `isValidStreamUrl` rejects anything that is not an `https:` URL
  (blocks `javascript:` / `data:` and mixed content). Checked in the route's zod
  body and again in `addMatchMedia`.
- **Host whitelist.** A provider table covers YouTube (rewritten to
  `youtube-nocookie.com/embed`), Twitch (channel or `/videos/<id>`, with the
  `parent=<host>` the Twitch player demands), Dailymotion and Vimeo. A URL is
  whitelisted only when a provider matches AND can build a real player URL from
  it, so a bare channel root with no player form stays link-only.
- **`embeddable`** is resolved server-side (`resolveEmbeddable`: override, else
  whitelist) and returned as a plain boolean; the client never sees the raw
  override.
- **Trust drives the sandbox.** `resolveEmbedAttrs` (client-side, it needs the
  request host for Twitch) builds the iframe `src`, `sandbox`, `allow` and
  `referrerpolicy`:

| Case | `src` | `sandbox` | `referrerpolicy` |
|---|---|---|---|
| Recognised provider (trusted) | provider player URL | player: scripts + same-origin + presentation + fullscreen | `strict-origin-when-cross-origin` (YouTube needs the origin) |
| Admin force-embedded unknown host | the raw URL | strict: no `allow-same-origin` | `no-referrer` |
| `sandbox: true` override | as above | player sandbox forced | by trust |
| `sandbox: false` override | as above | attribute omitted (hosts that refuse sandboxing, e.g. some PPV players) | by trust |

- **`allow`** defaults to `DEFAULT_EMBED_ALLOW` (autoplay, fullscreen,
  encrypted-media, picture-in-picture). An admin value is passed through
  `sanitizeAllow` on write and again on render: bare lowercase feature tokens
  only, deduped, capped at 200 chars, so it can never inject markup or other
  iframe attributes.
- The iframe always carries the legacy `allowfullscreen` attribute plus the
  `allow-fullscreen` sandbox token, so fullscreen works even when a pasted
  `allow` omits it.
- Every embed keeps an "open in a new tab" link under it: a host that blocks
  framing (X-Frame-Options) fails silently with no error event.

## Status gating and pruning

- `visibleMediaForStatus` shows `LIVE` links while a match is anything but over,
  and only `REPLAY` / `HIGHLIGHTS` once it is `FINISHED` or `AWARDED`. The API
  returns every row; the web client filters.
- Finalize housekeeping: each [sync finalize](predictions-and-scoring.md) pass
  calls `pruneLiveMediaForFinishedMatches` inside its transaction, deleting the
  `LIVE` rows of finished/awarded matches (1.28.1), so dead stream links do not
  linger even if the curation bot never cleans up.

## API

| Route | Auth | Service |
|---|---|---|
| `GET /api/matches/[id]/media` | public (`defineReadHandler`) | `listMatchMedia` (ordered by kind, then creation) |
| `POST /api/admin/matches/[id]/media` | admin session OR `media:write` key | `addMatchMedia` (404 on unknown match) |
| `DELETE /api/admin/matches/[id]/media/[mediaId]` | admin session OR `media:write` key | `deleteMatchMedia`, scoped to the path's match so a link is only deletable through its own match |

Both writes use `defineValidatedHandler` with `admin: true, apiKey: { media:
['write'] }` and a zod `response`. Label is 1-80 chars, URL at most 2048.

## Machine clients (API keys)

- The `media:write` scope is declared in `apps/web-nuxt/shared/api-scopes.ts`
  (the single scope list shared by the mint route, the admin picker and the
  permission conversion; the only other scope is `leaderboard:read`).
- `defineValidatedHandler` honours an `x-api-key` header only on routes that
  set `apiKey`; elsewhere a key gets a 401. A key request skips the same-origin
  CSRF check and goes through `requireApiKey`, which verifies the permissions via
  better-auth and, for an admin route, requires the key's **owner** to be an
  admin. See [../architecture/auth.md](../architecture/auth.md).
- Keys are minted from the admin page's API-clients section
  (`/api/admin/api-keys`) or on a prod host with `mise run create-api-key <name>`
  (default `--permissions media:write`, optional `--expires-in-days`, `--owner`
  defaulting to the oldest admin). The task inserts the `apikey` row through
  `docker compose exec db psql` with `-v` vars, mirroring the hash format of
  `server/utils/api-keys/mint.ts`, and prints the plaintext once (it suggests
  `STREAMSNIPER_API_KEY=` for the curation bot).

## UI

- **Match page** (`app/pages/[competition]/matches/[id].vue`): a `Live` tab, or
  `Replay` / `Highlights` tabs once the match is over, each only when a visible
  link of that kind exists (1.26.0). Embeds stack, link-only items flow as
  buttons in a row. A pin button lifts the watch area above the tabs so the
  stream keeps playing while you browse; pinning drops the media tabs from the
  strip. The pin is a plain ref, reset per match view.
- **Goal overlay suppression**: while a `LIVE` embed is on-screen (pinned or on
  the open Live tab), `liveStreamPlaying` stops the full-screen goal celebration,
  which would cover the delayed broadcast and spoil the goal (1.39.2).
- **Admin panel**: `MatchMedia.vue`, rendered at the bottom of the match page for
  admins only, at any status. Lists links with an embeds / link-only badge and a
  red "unsandboxed" badge, removes them, and adds new ones with kind, embed
  (auto / force / off), sandbox (auto / on / off, with a warning on off), label
  and allow. Pasting a provider's `<iframe>` tag into the URL field extracts its
  `src` and `allow` (`parseIframeEmbed`, anchored so `data-src` is not mistaken
  for `src`).
- **Renderer**: `MatchMediaEmbed.vue` renders one item (iframe via
  `resolveEmbedAttrs`, or the link button).
- **Multiview**: `multiview/Cell.vue` takes the first embeddable visible item as
  its stream and `CellStream.vue` renders it through `MatchMediaEmbed`; see
  [multiview.md](multiview.md).
- **Client state**: `useMatchMedia` / `useMatchMediaActions`
  (`app/composables/useMatchMedia.ts`), query key `['match-media', id]`,
  invalidated on add/remove. Strings live under the top-level `media.*` i18n
  namespace.
- **Mobile**: the Flutter match screen has a media tab
  (`apps/mobile-flutter/app/lib/ui/match/tabs/media_tab.dart`) that lists every
  returned link and opens it in an external app; it does not embed and does not
  apply `visibleMediaForStatus`. See [mobile-app.md](mobile-app.md).

## Sources

- `apps/web-nuxt/shared/match-media.ts` (+ `match-media.test.ts`)
- `apps/web-nuxt/server/utils/match-media/service.ts` (+ `service.test.ts`)
- `apps/web-nuxt/server/api/matches/[id]/media.get.ts`
- `apps/web-nuxt/server/api/admin/matches/[id]/media/index.post.ts`, `[mediaId].delete.ts`
- `apps/web-nuxt/server/utils/sync/finalize.ts` (`pruneLiveMediaForFinishedMatches`)
- `apps/web-nuxt/server/utils/validated-handler.ts` (`apiKey` option),
  `apps/web-nuxt/server/utils/auth-guards.ts` (`requireApiKey`)
- `apps/web-nuxt/shared/api-scopes.ts`, `apps/web-nuxt/server/utils/api-keys/`,
  `apps/web-nuxt/server/api/admin/api-keys/`, `mise-tasks/create-api-key`
- `apps/web-nuxt/db/app-schema.ts` (`match_media`, `match_media_kind`)
- `apps/web-nuxt/app/components/MatchMedia.vue`, `MatchMediaEmbed.vue`,
  `multiview/Cell.vue`, `multiview/CellStream.vue`
- `apps/web-nuxt/app/composables/useMatchMedia.ts`
- `apps/web-nuxt/app/pages/[competition]/matches/[id].vue`
- `apps/mobile-flutter/app/lib/ui/match/tabs/media_tab.dart`
