---
name: release
description: Cut a Nostragoalus release, the whole shebang - docs sweep (README, CHANGELOG, API response schemas, about-page tech stack), then mise run release (version bump, full gate, commit, annotated tag, push). Use when the user says "cut a release", "release", or "the whole release shebang".
---

# Release shebang

Everything between "the code is done" and "the tag is pushed". The heavy lifting
lives in `mise run release <x.y.z>`; the value of this skill is the docs sweep
before it.

## 1. Pre-flight

- Working tree clean, on `main`, up to date with origin.
- Find the previous version: `git describe --tags --abbrev=0` (tags are `vX.Y.Z`).
- Pick the next semver (minor bump for features, patch for fix-only).

## 2. Docs sweep (review everything against `git diff v<last>..HEAD`)

- **CHANGELOG.md `[Unreleased]`** must cover every user-visible change since the
  last tag (convention: entries are added per-commit during development, so this
  is usually just a completeness check against `git log v<last>..HEAD --oneline`).
  Keep a Changelog categories: Added / Fixed / Changed / Security-ops.
- **README.md**: Features list, env vars, commands - update if the release adds
  user-visible features, config, or workflow changes.
- **API response schemas** (`server/utils/docs/response-schemas.json`): if API
  routes were added or their response shapes changed, regenerate by sampling the
  RUNNING app: bring the dev stack up (`mise run dev` or the app-dev container on
  :3000, needs the `verify@example.com` admin), add any new public GET endpoints
  to the `TARGETS` map in `scripts/gen-api-schemas.mjs`, then
  `node scripts/gen-api-schemas.mjs`. Admin-only (internal) routes stay out of
  the docs on purpose. Endpoint descriptions themselves live inline in
  `defineRouteMeta` blocks - nothing to regenerate for those.
- **About page** (`app/pages/about.vue`): the changelog tab parses
  `CHANGELOG.md?raw` automatically - no action. The tech-stack list is manual:
  update it only if dependencies were added/removed since the last tag
  (`git diff v<last>..HEAD -- package.json`).
- Commit the docs sweep as `docs(release): ...` (the release task requires a
  clean tree).

## 3. Cut it

```bash
mise run release <x.y.z> --dry-run   # preview the changelog section
mise run release <x.y.z>             # the real thing
```

The task: moves `[Unreleased]` into a dated `## [x.y.z]` section, bumps
`package.json`, runs the full gate (typecheck + unit coverage + component
tests), commits `chore(release): x.y.z`, creates annotated tag `vx.y.z`, and
pushes with `--follow-tags`.

## 4. Verify

- `git tag -l 'v*' | tail -1` and `grep '"version"' package.json` agree.
- If asked to deploy: `docker compose up -d --build --wait`, then check
  `curl -s localhost:3000/about | grep -c <x.y.z>` returns >= 1.
