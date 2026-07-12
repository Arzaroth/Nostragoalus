# Changelog / "What's new"

The release history surfaced inside the app. The `/about` page renders a
changelog section (`#changelog`), and the header avatar menu carries a "What's
new" item that badges with a dot when there is an unseen release.

## Where the content comes from

`CHANGELOG.md` (repo root, Keep a Changelog) is the canonical English source and
the release tooling's input. It is imported with Vite `?raw` and parsed at
module load by `parseChangelog` (`apps/web-nuxt/app/utils/changelog.ts`) into
`{ version, date, sections[{ title, items[] }] }`; the `[Unreleased]` block is
dropped. Inline bullet markdown (bold, `code`, links) is rendered with `marked`
and sanitized with DOMPurify on the about page.

## Translated by active locale

The changelog renders in the active locale. Translations are parallel
Keep-a-Changelog files, `i18n/changelogs/{fr,th,tlh,ar}.md`, mirroring
`CHANGELOG.md` bullet-for-bullet (identical version headers and dates;
translated section titles and bullets). `useChangelog` imports all five with
`?raw`, parses each, and `selectLocaleChangelog` overlays the active locale onto
the English list per version - falling back to the English entry for any version
a locale has not translated, so a card never goes blank. English stays canonical
for the version list, ordering, and the unseen comparison (all locale-independent
since headers match). The all-five-locales rule and the
`mise run changelog check` parity guard are covered in
[../architecture/i18n.md](../architecture/i18n.md).

## "Since last seen"

Signed-in users carry a `lastSeenChangelogVersion` (a better-auth additional
field on the session). `isUnseen` (strict newer-than compare) drives both the
header dot and a per-card highlight on the about page. On first load a user with
no marker is baselined to the latest version (`ensureBaseline`), so the badge
fires on the next release, not the whole back catalogue; opening the changelog
advances the marker (`markSeen`). The about page snapshots the pre-visit marker
so the new entries stay highlighted while being read. Signed out, there is no
marker and nothing to badge.

## Sources

- `CHANGELOG.md`, `i18n/changelogs/{fr,th,tlh,ar}.md`
- `apps/web-nuxt/app/composables/useChangelog.ts`, `apps/web-nuxt/app/utils/changelog.ts`
- `apps/web-nuxt/app/pages/about.vue` (`#changelog`), `apps/web-nuxt/app/layouts/default.vue` (badge + menu)
- `mise-tasks/changelog` (`read` / `promote` / `check`), `mise-tasks/release`
