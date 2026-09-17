# The provider canary (has the feed moved?)

Every match provider in [providers.md](providers.md) reads a public but
**undocumented** feed. Nobody announces the day ESPN renames `scoringPlay` or
FIFA moves `IdGroup`. The adapters are written defensively, so nothing throws -
they simply stop producing a goal, a group letter, a kickoff time. A silent
failure, and the worst kind: the app keeps serving, with less in it.

The provider unit tests cannot see this. They build their own payloads (`event(spec)`
factories in `espn.test.ts`, the equivalents in `fifa/uefa/worldrugby.test.ts`)
and inject `fetchImpl`. Excellent for the parsing logic, blind to drift **by
construction** - we write the bytes they parse. There is no runtime schema
validation either: upstream shapes are TypeScript interfaces, erased at build.

So: `apps/web-nuxt/scripts/canary/`, the only program in the repo that really
talks to the network, run daily by `.github/workflows/canary.yml` and **never**
by `ci.yml`.

## Run it

```
pnpm -C apps/web-nuxt canary                       # all four sources
pnpm -C apps/web-nuxt canary --sources espn,uefa   # a subset
```

Exit codes: **0** all well, **1** a key is gone or changed type, **2** a source
could not be reached, **64** a bad argument. The full report prints either way -
what is wanted is the list of damage, not its first line.

## Three levels of demand

`scripts/canary/ledger.ts`. Each upstream object has a table of
`[path, level, check]`. A key cannot be judged on one object, so every key is
counted across every object of its kind and the verdict falls at the end.

| Level | Meaning | Absent verdict | Fails the run |
|---|---|---|---|
| `REQUIRED` | On every object of its kind. A fixture with no kickoff time does not exist. | `MISSING` | yes |
| `SAMPLED` | Only in some contexts (a penalty score, a substitution). Must appear at least once across everything inspected. | `MISSING` | yes |
| `RARE` | The context is real but too rare to be sure of meeting today: an own goal, a VAR decision's free text. | `absent` | **no** (a wrong type still does) |

Plus `unchecked`: no object of that kind turned up at all, so the key could not
be looked at. Not a failure. Without that verdict a quiet July goes red every
morning, and a red that is always on is a red nobody reads. Every planned key is
declared before anything is fetched, so one that could not be looked at prints as
`unchecked` rather than dropping silently out of the report.

Two rules that took a live run each to find:

- **A `| null` in the provider's TypeScript type is nullable by contract**, not by
  accident: FIFA's `IdGroup` is null on every knockout tie. Those stay `REQUIRED`
  and wrap their check in `nullable()`, so the key vanishing is still caught.
- **An explicit `null` on a `SAMPLED`/`RARE` key counts as absence**, not as a
  wrong type. World Rugby spells out `"attendance": null` where ESPN just omits
  the key; the two have to read the same. Only `REQUIRED` holds a null against
  the feed.

Type checks are borrowed from the real code wherever one exists - the canary
reads with the program's eyes, not its own.

## Cross-checks: the keys can all be there and produce nothing

Every source re-feeds its live payload to the normalizer the app actually runs
(`normalizeEspnEvent`, `normalizeFifaMatch`, `normalizeUefaMatch`,
`normalizeWorldRugbyMatch`, and the timeline/bracket/lineup ones) and compares
with what it just counted by hand. This is what catches drift that leaves every
key in place:

- normalized count vs usable count in the response;
- matches in state `post` with none mapping to `FINISHED` (a status vocabulary
  that drifted parks a played tournament on SCHEDULED for ever);
- a group label that no longer yields a letter (files a whole group stage under
  no group, so nothing scores);
- events present but not one recognised as a goal / a known kind;
- a clock nothing can read - the key stays, the value changes shape, and
  stoppage-time goals stop counting;
- every World Rugby fixture losing its kickoff time, since the provider's own
  `timed` filter then drops the entire competition in silence.

## Per-source notes

| Source | What it walks | Choices worth knowing |
|---|---|---|
| `espn` | scoreboard, summary, teams, standings for `eng.1` + `esp.1` | The soccer scoreboard answers **400 to a date range** and serves only today without `dates`, so it is asked per season year exactly as the provider asks, walking back up to 3 years for one that was played. The group shape is probed on the finished **2022 World Cup** standings: a single-table league has no `children`, and demanding it would be red every morning. |
| `fifa` | seasons, calendar, timeline, match detail, bracket (competition 17) | The season is picked by the app's own `pickFifaSeason`, so the canary reads what the app would. Off-cycle the SAMPLED keys report `unchecked`, which is the honest answer. `BallPossession` goes null once an edition is archived: the block is REQUIRED, the numbers in it are RARE. |
| `uefa` | matches, events (3 matches), lineups (competition 3) | Walks back up to 4 `seasonYear`s: the feed does not always hold what the calendar says. Events come from **three** matches spread across the season - one match is too small a population for a key like `subType`. |
| `worldrugby` | event catalog, schedule, timeline, summary (`mru`) | Picks the newest started events from the catalog and adds more until ~20 fixtures, because the newest event can be a four-fixture tournament. |

Sofascore odds are deliberately **not** covered yet: they go through the cycletls
engine (TLS fingerprinting) and football-data needs a key, so neither is known to
work from a GitHub-hosted runner. See `TODO.md`.

## Why it is off the normal CI

`.github/workflows/canary.yml` runs on `schedule` (06:23 UTC) and
`workflow_dispatch`, never on `push` or `pull_request`. `ci.yml` has to stay
offline and deterministic; otherwise a FIFA outage, or a Tuesday in July with
nothing played, repaints changes that have nothing to do with it.

The alarm is a **GitHub issue**, not a red cross - a cross in the Actions tab is
a thing nobody looks at. One issue is kept open and the following mornings
comment on it. Only exit 1 opens it: an unreachable source still turns the run
red (nothing was verified that day, and that must be visible) but files no issue.
The report uploads as an artifact on `always()`, because the green report is what
says what was **not** checked.

## The canary is itself tested, offline

`apps/web-nuxt/tests/canary/` runs in the normal unit project and gate. It hands
each source payloads built by hand: a complete one (must be green), the same ones
missing a key or carrying the wrong type (must be red, and name the key), and one
with nothing played (must not cry wolf). `tests/canary/ledger.test.ts` covers the
verdict machinery itself.

`scripts/` is outside the coverage `include` (see
[testing.md](testing.md)), so the canary does not sit in the 98% denominator -
but `tsconfig.canary.json`, wired into `pnpm typecheck`, does typecheck it.
Neither of Nuxt's generated tsconfigs reaches `scripts/`, and without that step
the canary would compile against provider signatures that had already moved and
rot in silence, which is the exact failure it exists to catch.

## Sources

- `apps/web-nuxt/scripts/canary/ledger.ts` (levels, checks, verdicts, the report)
- `apps/web-nuxt/scripts/canary/source.ts` (fetch with retries, `Unreachable`, the source contract)
- `apps/web-nuxt/scripts/canary/sources/{espn,fifa,uefa,worldrugby}.ts` (key tables + cross-checks)
- `apps/web-nuxt/scripts/canary/{run,main}.ts` (orchestration, report, exit codes)
- `apps/web-nuxt/tests/canary/{ledger,sources}.test.ts` (the canary, offline)
- `apps/web-nuxt/tsconfig.canary.json`, `apps/web-nuxt/package.json` (`canary`, `typecheck`)
- `.github/workflows/canary.yml` (daily schedule, artifact, issue-or-comment alarm)
- Prior art: [github.com/boubou666/butbutbut](https://github.com/boubou666/butbutbut) `tools/canari.py`
