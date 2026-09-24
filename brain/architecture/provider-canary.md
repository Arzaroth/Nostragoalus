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
pnpm -C apps/web-nuxt canary --sources=espn        # either spelling
```

| Code | Meaning | Files an issue |
|---|---|---|
| 0 | every watched key is where the providers expect it | no (closes an open one) |
| 1 | **the canary itself is broken** - our bug, not the feed's | no |
| 2 | a source could not be reached: a timeout, a 5xx, a 429 | no |
| 3 | the shape moved: a key is gone or changed type | yes |
| 64 | a bad argument | no |

Drift is **3 and not 1** deliberately. An unhandled throw, a missing script, a
tsx that will not load all exit 1 already, so 1 has to mean "the canary is in
trouble" - otherwise the workflow files our own breakage as a feed change and
blames ESPN for it. The run also prints `canary-verdict: <green|drift|unreachable|broken>`,
which the workflow greps, because an exit code alone cannot be trusted to have
come from the canary rather than from pnpm.

## Three levels of demand

`scripts/canary/ledger.ts`. Each upstream object has a table of
`[path, level, check]`. A key cannot be judged on one object, so every key is
counted across every object of its kind and the verdict falls at the end.

| Level | Meaning | Absent verdict | Fails the run |
|---|---|---|---|
| `REQUIRED` | On every object of its kind. A fixture with no kickoff time does not exist. | `MISSING` | yes |
| `SAMPLED` | Only in some contexts (a group name, a substitution). Must appear at least once across everything inspected. | `MISSING` | yes |
| `RARE` | The context is real but too rare to be sure of meeting today: an own goal, a VAR free text, a bracket `Winner` between World Cups. | `absent` | **no** (a wrong type still does) |

Plus `unchecked`: no object of that kind turned up at all, so the key could not
be looked at. Not a failure. Without those two verdicts a quiet July goes red
every morning, and a red that is always on is a red nobody reads. Every planned
key is declared before anything is fetched - the plan lives on the source and the
**runner** builds the ledger from it - so a key that could not be looked at
prints as `unchecked` rather than dropping silently out of the report.

Four rules that each took a live run or a review to find:

- **A `| null` in the provider's TypeScript type is nullable by contract**, not by
  accident: FIFA's `IdGroup` is null on every knockout tie. Those stay `REQUIRED`
  and wrap their check in `nullable()`, so the key vanishing is still caught.
- **An explicit `null` or `""` on a `SAMPLED`/`RARE` key counts as absence**, not
  as a wrong type. World Rugby spells out `"attendance": null` where ESPN omits
  the key, and ESPN serializes an undrawn side with empty strings which the
  adapters already read as absence. All three must read the same. Only `REQUIRED`
  holds them against the feed.
- **A key read only as a fallback behind a present one is `RARE`** - ESPN's
  `athlete.shortName`, World Rugby's `countryCode`. Its absence costs nothing
  while the key in front of it holds.
- **A key that only exists in one phase is checked only in that phase.** ESPN's
  `status.period` and `details` are asked of matches that kicked off, `winner`
  and `shootoutScore` of decided ones. Asking them of a board of fixtures reds
  every pre-season morning.

Type checks are borrowed from the real code wherever one exists - the canary
reads with the program's eyes, not its own. They also refuse a scalar wrapped in
a one-element array, which is an ordinary way for an upstream to add multi-value
support and used to read as OK while the app's `Number()` broke.

## Cross-checks: the keys can all be there and produce nothing

Every source re-feeds its live payload to the normalizers the app actually runs
and compares with what it just counted by hand. A cross-check earns its place
only if it can **fire**: comparing the output of a normalizer that never returns
null against the count of what was fed to it compares a number with itself, and
several first-draft checks did exactly that. What is asserted now:

- matches that normalize without a kickoff time (`NOT NULL` downstream);
- matches in state `post` with none mapping to `FINISHED` - a status vocabulary
  that drifted parks a played tournament on SCHEDULED for ever;
- a decided ESPN match that resolves no `winner`, which is what carries knockout
  progression and the derived bracket;
- a group or matchday label that no longer yields a letter or a number, which
  files a whole stage under nothing and silently drops it at insert;
- an ESPN type-id vocabulary where no event maps to a card, a substitution or a
  period marker (a goal alone proves nothing - `espnEventKind` falls back to
  `scoringPlay`);
- a boxscore whose `displayValue` stopped parsing as a number, which is the only
  thing `parseEspnMatchStats` has to work with;
- a standings tree whose group names no longer satisfy `parseGroupNameStrict`;
- a FIFA bracket where no round is named for the final, so no champion resolves
  even though every tie still renders;
- a clock nothing can read, and a World Rugby `time.secs` that stopped being a
  number - the ledger's `integer` check accepts `"1234"`, so only this sees it;
- every timed World Rugby fixture losing its kickoff, since the provider's own
  `timed` filter then drops the whole competition in silence.

ESPN additionally re-runs `espnSummaryTeams`, `parseEspnGoals`,
`parseEspnTimeline`, `parseEspnMatchDetail`, `parseEspnMatchStats` and
`parseEspnLineups` over the live summary; it was the only source watching its
detail document as a shape and never as behaviour.

## Per-source notes

| Source | What it walks | Choices worth knowing |
|---|---|---|
| `espn` | scoreboard, summary, teams for `eng.1` + `esp.1`; standings and a knockout ladder on the 2022 World Cup | The soccer scoreboard answers **400 to a date range** and serves only today without `dates`, so it is asked per season year exactly as the provider asks. The walk-back wants a season with a **played** match, not merely a non-empty one. The group and knockout shapes are probed on a finished World Cup because a single-table league has no standings `children` and never produces a knockout slug. |
| `fifa` | seasons, calendar, timeline, match detail (incl. bookings and substitutions), bracket | The season is picked by the app's own `pickFifaSeason`, which **throws** rather than returning empty - caught, or it kills the whole run. Off-cycle it returns the next, unplayed edition, so every key that only exists once a tournament is under way is RARE here. A 404 on the bracket means "not published yet", not drift. |
| `uefa` | matches, events (3 finished matches), lineups | Walks back up to 4 `seasonYear`s and **reports** when the newest ones carry no played match: accepting the first non-empty season is how this greenlit a two-year-old archive while the live season's endpoint answered with nothing. Events come from three matches spread across the season, and only `FINISHED` ones - an abandoned tie carries a score and can publish no events at all. |
| `worldrugby` | event catalog, schedule, timeline, summary (`mru`) | Adds events until ~20 fixtures, because the newest can be a four-fixture tournament. An event with no `sport` is **not** adopted: that key is all that separates fifteens from sevens and age-grade. `eventPhase` and `time.millis` are contextual, not required - a round-robin event publishes no phase at all and a "date TBC" tie is routine. |

Sofascore odds and football-data are deliberately **not** covered yet: they go
through the cycletls engine (TLS fingerprinting) and an API key respectively, so
neither is known to work from a GitHub-hosted runner. See `TODO.md`.

## Why it is off the normal CI

`.github/workflows/canary.yml` runs on `schedule` (06:23 UTC) and
`workflow_dispatch`, never on `push` or `pull_request`. `ci.yml` has to stay
offline and deterministic; otherwise a FIFA outage, or a Tuesday in July with
nothing played, repaints changes that have nothing to do with it.

The alarm is a **GitHub issue**, not a red cross - a cross in the Actions tab is
a thing nobody looks at. One issue is kept open, found by **label** rather than
by a fuzzy title search, and the following mornings comment on it; a green run
closes it again, so a stale thread cannot absorb the next alarm. Only the drift
verdict opens it. Every step that must survive trouble carries `always()`,
because a custom `if:` otherwise has `success()` ANDed into it and an artifact
blip would skip both the alarm and the verdict. The dispatch input goes through
`env:` and a bash array: a `${{ }}` inside a `run:` block is expanded into the
script text before bash parses it, which is an injection needing no commit and no
review.

Anything the feed controls is flattened and truncated by `safeLine()` before it
reaches the report, so a hostile upstream cannot close the markdown fence of an
issue authored by our own bot.

## The canary is itself tested, offline

`apps/web-nuxt/tests/canary/` runs in the normal unit project and gate, and
drives each source through the **real runner** over a stub `fetch`, so the ledger
ownership and the error taxonomy are covered by every source test. It hands them
a complete payload (must be green), the same ones missing a key or carrying the
wrong type (must be red, and name **exactly** that key), and one with nothing
played (must not cry wolf) - built genuinely unplayed, without the keys a played
match carries, rather than a played fixture wearing an unplayed label.
`runner.test.ts` pins the exit-code selection, `fetchJson`'s retry and refusal
handling, the season walk-back and the CLI; `ledger.test.ts` covers the verdict
machinery.

`scripts/` is outside the coverage `include` (see [testing.md](testing.md)), so
the canary does not sit in the 98% denominator - but `tsconfig.canary.json`,
wired into `pnpm typecheck`, does typecheck it. Neither of Nuxt's generated
tsconfigs reaches `scripts/`, and without that step the canary would compile
against provider signatures that had already moved and rot in silence, which is
the exact failure it exists to catch.

## Sources

- `apps/web-nuxt/scripts/canary/ledger.ts` (levels, checks, verdicts, the report)
- `apps/web-nuxt/scripts/canary/source.ts` (the error taxonomy, fetch with backoff, the season walk-back, the source contract)
- `apps/web-nuxt/scripts/canary/sources/{espn,fifa,uefa,worldrugby}.ts` (key tables + cross-checks)
- `apps/web-nuxt/scripts/canary/{run,main,cli}.ts` (orchestration, report, exit codes, arguments)
- `apps/web-nuxt/tests/canary/{ledger,sources,runner}.test.ts` + `helpers.ts` (the canary, offline)
- `apps/web-nuxt/tsconfig.canary.json`, `apps/web-nuxt/package.json` (`canary`, `typecheck`)
- `.github/workflows/canary.yml` (daily schedule, artifact, label-scoped issue alarm)
- Prior art: [github.com/boubou666/butbutbut](https://github.com/boubou666/butbutbut) `tools/canari.py`
