---
name: feature-treatment
description: Ship a finished feature branch the full way - rebase onto master, run a max-effort multi-agent code review, fix everything confirmed, update the brain/ knowledge base, pass the gate, merge, and cut a release. Use when the user says "feature treatment", "treat this branch", "review and merge this feature", or names a worktree/branch to ship.
---

# Feature treatment

The pipeline a finished feature branch goes through before it lands: **rebase →
max review → fix → update brain → gate → merge → release → clean up**. The point
is that nothing merges without an adversarial review and a green gate.

The branch to treat comes from the argument (a branch or worktree name). If none
given, find it: `git worktree list` and `git branch` - the feature branch is the
non-`master` one, usually under `.claude/worktrees/<name>` with a `worktree-<name>`
branch. Confirm which one if ambiguous.

## 1. Rebase onto master

```bash
cd .claude/worktrees/<name>          # work in the worktree
git rebase master
```
Resolve conflicts if any. The branch must sit directly on top of `master` so the
review and the merge see only this feature's diff.

## 2. Max-effort review (parallel finders)

Get the review diff: `git diff master...HEAD -- . ':(exclude)drizzle/meta/*'` (the
drizzle meta snapshot is generated - exclude it; it's thousands of lines).

Spawn **independent finder subagents in parallel** (one Agent tool call with
several invocations), each over the same diff with a different lens. Scale the
count to the feature (4-6 is typical):

- **Correctness** - line-by-line; inverted conditions, off-by-one, null deref,
  missing await, swallowed errors, ordering/sort bugs, response-shape vs client
  expectation, migration-vs-schema drift.
- **Security / authz / validation** - do admin/mutating endpoints actually
  enforce the guard the rest of the repo uses? input validation (length caps,
  enums), XSS (`v-html`?), data leaks in public endpoints, IDOR, SQL injection,
  shell injection in any CLI/mise task.
- **Integration / i18n** - every i18n key used exists in ALL locale files; any
  new `CHANGELOG.md` entry is mirrored bullet-for-bullet in every
  `i18n/changelogs/*.md` (the about page renders the changelog in the active
  locale; `mise run changelog check` enforces structural parity); new public
  routes are in `PUBLIC_ROUTES`; composable types match the endpoint;
  footer/admin wiring; migration journal sequence.
- **Reuse / simplify / altitude** - does new code re-implement an existing
  helper/pattern? copy-paste across sibling endpoints? fragile special-cases
  where generalizing is cleaner?
- **Pitfalls / tests** - language/framework footguns (Drizzle nullability,
  non-deterministic ordering, falsy-zero, reactivity loss); and whether the
  tests actually cover the new branches the 98% gate will demand (empty state,
  error paths, the reorder/edge cases, not-found).

Each finder returns findings as JSON objects `{file, line, severity, summary,
failure_scenario}`, verified (quote the line), most-severe first. Tell them NOT
to fix anything. Then optionally run one **sweep** finder that has the merged
list and hunts only for gaps.

## 3. Fix what's confirmed

Triage the findings. Fix every **confirmed correctness / security** issue and the
worthwhile quality ones. For anything real-but-out-of-scope, add a `TODO.md`
line rather than dropping it. Re-verify a claim before fixing - finders surface
plausible-but-wrong items too.

## 4. Update the brain

Bring the `brain/` knowledge base in line with what this feature changed - it
ships in the SAME merge, not as a follow-up. Apply the **brain** skill (it has the
full navigate / maintain / audit checklist); the essentials:

- New feature -> add `brain/features/<name>.md` (dense, present-tense, ends with a
  `## Sources` list of real code paths), then a row in `brain/features/index.md`
  and the catalog table in `brain/BRAIN.md`.
- Changed an existing feature -> update its `brain/features/*.md`. Changed
  cross-cutting tech (schema, auth, realtime, storage, providers, build) -> update
  the matching `brain/architecture/*.md` (and `database.md` tables/enums if the
  schema moved).
- New non-obvious decision (from the build or surfaced in review) -> append it to
  `brain/decisions.md` with its WHY. New term -> `brain/glossary.md`.
- Secret/easter-egg features go in the brain too (e.g.
  `brain/features/easter-eggs.md`), just not in the public CHANGELOG/ROADMAP.
- Style: normal prose, no em-dashes, relative cross-links, link source paths
  rather than restate code.

Commit the brain changes on the branch with the feature (or fold them into the
review-fix commit) so the gate and the merge carry them. Quick check before
committing: every relative link in a touched brain doc resolves to a real file.

## 5. Gate (must be green before merge)

```bash
pnpm exec nuxt typecheck
mise run changelog check  # translated changelogs mirror CHANGELOG.md (all locales)
pnpm test:coverage        # >=98% branches (server/utils, shared, app/utils)
pnpm test:components      # Nuxt-runtime component/composable tests
```
New branches you added (services, reorder/edge cases) must be covered or the
coverage gate fails. If the feature touched `CHANGELOG.md`, the same entries
must be added to each `i18n/changelogs/{fr,th,tlh}.md` or the changelog check
fails. Commit the review fixes on the branch:
`fix(<area>): max-review fixes - <one-line summary>`.

## 6. Regenerate API response schemas (only if a public GET endpoint changed)

If this feature added or changed a **public GET** endpoint, refresh the sampled
docs now, on the branch, so the change ships with its docs instead of becoming
another "add on the next controlled regen" TODO line. Skip entirely if no public
GET shape moved.

The regen samples a **running stack against the seeded dev DB**
(`scripts/gen-api-schemas.mjs`), so the only way it's deterministic - no drift in
the ~20 unrelated endpoint examples - is to run it against the **canonical seed**,
not a hand-mutated or prod-like DB.

```bash
# 1. Add any NEW endpoint to the TARGETS map in scripts/gen-api-schemas.mjs first
#    (docPath -> live sample path; reuse the world-cup-2022 / 2026 seed slugs).
# 2. Bring the stack up on a freshly-seeded DB so the samples are the seed's
#    canonical values, then regen:
mise run dev          # or preview; needs the seeded DB + verify@example.com admin
node scripts/gen-api-schemas.mjs
```

Review `git diff server/utils/docs/response-schemas.json`: the new/changed
endpoint blocks are the intended change. If unrelated blocks also moved, they
drifted because the running DB wasn't the canonical seed - reseed and re-run
rather than committing live drift (or, if only the intended blocks are wanted,
`git checkout -p` to keep just those). Commit on the branch with the feature.

This is also where the backlog of deferred "not in the sampled schemas" endpoints
gets cleared - if any are now seed-reachable, add them to `TARGETS` in the same
pass and tick their TODO.md lines.

## 7. Merge

```bash
cd <main repo root>
git merge --ff-only worktree-<name>      # fast-forward; the rebase made this clean
```

## 8. Release

Run the **release** skill. Pick the bump: **minor** for a user-facing feature,
**patch** for fix-only. That skill does the docs sweep (CHANGELOG, README, and the
about-page tech-stack list - if the feature added a dependency, add it there, one
entry per project with the library's own tagline; the API response schemas were
already regenerated in step 6) and
`mise run release <x.y.z>` (gate + tag + push). Remember its gotchas: **stop the
`app-dev` container first**, and stash any unrelated dirty files (e.g. the user's
`TODO.md`/`ROADMAP.md`) so the tree is clean, then restore them after.

## 8. Clean up

```bash
git worktree remove .claude/worktrees/<name>
git branch -d worktree-<name>
```

## Done when

The feature is on `master`, the brain reflects the change, the gate was green, a
tag is pushed, and the worktree is gone. Report the version and a one-line summary
of what was fixed in review.
