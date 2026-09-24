# iCal calendar feed

A per-user iCalendar (`.ics`) subscription of every fixture and pick deadline,
which the player adds once to Google Calendar, Apple Calendar, Outlook or
Thunderbird and which then refreshes on the client's own polling cadence. The
feed is public and session-less: a signed token in the URL is the whole
capability, so it deliberately carries nothing a stranger holding the link should
not see (fixtures, public results, and a predicted / not-predicted flag, never a
predicted score). The link can be regenerated, which revokes every earlier one.

## Flow

1. **Mint.** `GET /api/feed/subscription?locale=` (`defineReadHandler`,
   `auth: 'user'`) signs a token for the caller and returns `{ url, webcalUrl }`
   (`feedUrlsSchema`, `apps/web-nuxt/server/schemas/roadmap.ts`). `url` is
   `<origin>/api/feed/calendar.ics?token=...`; `webcalUrl` is the same URL with the
   scheme swapped to `webcal:`, which makes calendar apps offer a one-tap
   subscribe. The token is deterministic (same user + locale + version gives the
   same token), so the call is idempotent and the URL stays stable.
2. **Serve.** `GET /api/feed/calendar.ics?token=` is a plain
   `defineEventHandler` with no session. It verifies the token, checks the
   version against the user row, loads the matches and returns the calendar as
   `text/calendar; charset=utf-8`, `content-disposition: inline;
   filename="nostragoalus.ics"`, `cache-control: private, max-age=300` (so a
   tightly polling client cannot hammer the DB). Any failure (bad signature,
   unknown user, stale version) is the same `404 feed not found`, so a revoked
   URL never confirms that the user exists.
3. **Regenerate.** `POST /api/feed/regenerate?locale=` (`defineValidatedHandler`,
   so session + same-origin gated, no body) atomically bumps
   `user.feed_token_version` and returns a fresh `{ url, webcalUrl }` minted at
   the new version.

An unknown `locale` on mint or regenerate falls back to `en` rather than failing
validation.

## Token + revocation

The token goes through the shared stateless signed-token codec
(`apps/web-nuxt/server/utils/signed-token/codec.ts`, also behind
[share images](share-images.md)): `<b64url(JSON)>.<b64url(HMAC)>`, the key
domain-separated from the auth secret (`runtimeConfig.betterAuthSecret`) by the tag `nostragoalus/ical-feed/v1`,
a timing-safe compare, a 512-char input cap, and refusal to sign or verify under
an empty secret. `apps/web-nuxt/server/utils/feed/token.ts` only pins the tag and
the payload shape: `u` (user id), `l` (locale, one of `FEED_LOCALES`), `fv`
(feed-token version) and `v: 1` (payload format).

Unlike share tokens, feed tokens carry **no expiry**: a calendar subscription is
meant to poll indefinitely. Revocation is per user instead, through
`user.feedTokenVersion` (integer, default 0, a better-auth additional column in
`apps/web-nuxt/db/auth-schema.ts`, added by migration `0059`). The `.ics` route
rejects any token whose `fv` differs from the stored version, so one regenerate
kills every link issued before it. Rotating the app secret still kills every feed
at once.

`fv` is optional in the payload. Tokens minted before versioning existed carry
none, and the route reads an absent `fv` as version 0, the column default, so
calendars already subscribed before revocation shipped kept working until their
owner regenerates. The first cut required `fv` and would have silently broken every
existing subscription; the release review caught it before 2.23.0 shipped.

## What an event contains

`buildFeedCalendar` (`apps/web-nuxt/server/utils/feed/ical.ts`) is a hand-rolled
RFC 5545 writer, no dependency. The calendar carries `X-WR-CALNAME` (localized),
`X-WR-TIMEZONE:UTC` and one `VEVENT` per match:

- `UID` is `<matchId>@nostragoalus`, so a re-poll updates events in place.
- `DTSTART` is kickoff in UTC; `DTEND` is a fixed kickoff + 2 hours.
- `SUMMARY` is `Home - Away`, or once both full-time scores exist
  `Home 2-1 Away`, plus `(4-3 pens)` when both shootout scores exist. A
  half-populated score is treated as not finished.
- `DESCRIPTION` is `Competition · Round`, plus a "prediction locked in" / "no
  prediction yet" line only while the match is upcoming (`SCHEDULED` and kickoff
  still in the future).
- `URL` deep-links to `/<competition-slug>/matches/<id>`
  ([competition routing](competitions.md)).
- A `VALARM` (display, `TRIGGER:-PT3H`) is added **only** to an upcoming match the
  user has not predicted. The 3 hours mirror the in-app pick reminder's
  `REMINDER_LEAD_MS` (`apps/web-nuxt/server/utils/notifications/reminders.ts`) but
  are hard-coded, not imported. This is the feed's only personalization.

TEXT values are escaped (backslash, `;`, `,`, newlines, lone CR) and every content
line is folded at 75 octets without splitting a multi-byte character; lines end
in CRLF.

## Scope

`getFeedMatches` (`apps/web-nuxt/server/utils/feed/service.ts`) returns every
match of an **active** competition whose kickoff is within the last 7 days or in
the future, ordered by kickoff then id, plus a per-match `predicted` flag from the
user's `prediction` rows. There is no per-user competition filter (no "followed
competitions" concept exists), so finished tournaments drop out on their own once
they go inactive or age past the window. The feed is sport-agnostic: rugby
fixtures appear the same way ([rugby](rugby.md)).

## i18n

The event text (calendar name, predicted / not-predicted lines, `pens`, the alarm
text) is rendered server-side in the locale baked into the token, via
`shareTranslator` (`apps/web-nuxt/server/utils/share/i18n.ts`), which reads the
same locale JSON as the app with an English fallback. `FEED_LOCALES` is an alias
of `SHARE_LOCALES` (`en`, `fr`, `th`, `tlh`, `ar`). Keys live under `feed.*` in
`shared/i18n-json/*.json`, shared with the Preferences UI copy. A subscribed
calendar keeps the language it was minted in: changing the UI language does not
change an existing subscription. See [../architecture/i18n.md](../architecture/i18n.md).

## Clients

- **Web.** The "Calendar feed" card in `apps/web-nuxt/app/pages/preferences.vue`
  (signed-in only, inside `<ClientOnly>`) drives `useCalendarFeed`
  (`apps/web-nuxt/app/composables/useCalendarFeed.ts`). The URL is a secret, so it
  is fetched only when the user clicks "Show my calendar link", not eagerly. The
  card then offers copy-to-clipboard, an "Add to calendar" `webcal:` link and
  regenerate. The composable passes the active locale, and switching language
  while the link is shown re-mints it so the displayed URL matches the UI.
- **Mobile.** The Flutter `CalendarScreen`
  (`apps/mobile-flutter/app/lib/ui/calendar_screen.dart`) offers subscribe
  (`webcal:` via `launchUrl`), copy and a confirmed regenerate. It calls both
  endpoints without a `locale`, so mobile-minted feeds are always English. See
  [mobile-app.md](mobile-app.md).

The `.ics` route has no response schema in the emitted OpenAPI contract (it is not
JSON); see [../architecture/cross-stack-contract.md](../architecture/cross-stack-contract.md).

## Tests

Unit tests sit next to each module (`ical.test.ts`, `service.test.ts` against
pglite, `token.test.ts` including the legacy no-`fv` token and the
version-mismatch case). There is no Playwright spec and no component test for the
Preferences card.

## Shipped

The feed shipped in **1.37.0** (2026-06-26). Regenerate and per-user revocation
(`feed_token_version`) shipped in **2.23.0** (2026-07-05), in the
security-hardening batch that also moved the feed and share tokens onto the shared
signed-token codec.

## Sources

- `apps/web-nuxt/server/utils/feed/{ical,service,token}.ts` + their `*.test.ts`
- `apps/web-nuxt/server/utils/signed-token/codec.ts`, `apps/web-nuxt/server/plugins/assert-secret.ts`
- `apps/web-nuxt/server/api/feed/{calendar.ics.get,subscription.get,regenerate.post}.ts`
- `apps/web-nuxt/server/schemas/roadmap.ts` (`feedUrlsSchema`)
- `apps/web-nuxt/server/utils/share/{i18n,token}.ts` (`shareTranslator`, `SHARE_LOCALES`)
- `apps/web-nuxt/db/auth-schema.ts` (`user.feedTokenVersion`), `apps/web-nuxt/drizzle/0059_salty_meggan.sql`
- `apps/web-nuxt/app/composables/useCalendarFeed.ts`, `apps/web-nuxt/app/pages/preferences.vue`
- `apps/mobile-flutter/app/lib/ui/calendar_screen.dart`, `apps/mobile-flutter/app/lib/api/matches_api.dart`
- `shared/i18n-json/*.json` (`feed.*`), `CHANGELOG.md` (1.37.0, 2.23.0)
