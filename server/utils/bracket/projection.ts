import { compareByCriteria, type GroupStandings, type StandingRow } from '../stats/standings'
import type { Criterion } from '../stats/tiebreakers'
import type { NormalizedBracket } from '../../../shared/types/match'

// Predictive bracket: resolve a knockout slot's placeholder (e.g. "1A", "Winner
// Group B", "3rd C/D/E/F") to the team currently projected to fill it, from the
// live group standings. Pure + provider-agnostic: the API maps real bracket
// slots onto these helpers. A slot only projects once its group(s) are "ready"
// (every team has played at least once); anything unparseable is left TBD, so a
// projection is never wrong, only absent.

export type SlotRef =
  | { kind: 'winner'; group: string }
  | { kind: 'runnerUp'; group: string }
  // A best-third slot: the eligible groups its third-placed team is drawn from
  // (the provider lists them, e.g. "3rd C/D/E/F"). Empty = any group.
  // excludeGroup is the group of the opponent this slot faces (its winner/
  // runner-up), set by projectBracket so a third never plays its own group again.
  | { kind: 'third'; groups: string[]; excludeGroup?: string }
  // A match-winner reference ("Winner 49") or anything we can't read: not
  // projectable from group standings.
  | { kind: 'other' }

export interface ProjectedTeam {
  code: string
  name: string
}

// Parse a slot placeholder into a structured reference. Tolerant of the compact
// provider form ("1A"/"2B"/"3CDEF") and worded forms ("Winner Group A",
// "Runner-up B", "3rd placed C/D/E/F"). Order matters: the third-placed forms
// are matched before the rank forms, and a bare "3" inside a match reference
// ("Winner 3") is never treated as a group third.
export function parseSlotPlaceholder(raw: string | null | undefined): SlotRef {
  const s = (raw ?? '').trim()
  if (!s) return { kind: 'other' }
  const up = s.toUpperCase()

  // Worded third: "3rd placed C/D/E/F", "Third C/D/F" - groups are whatever
  // follows the marker (a clean group list, never embedded in another word).
  if (up.includes('THIRD') || /\b3RD\b/.test(up)) {
    // After the marker the groups are a clean list (e.g. "C/D/E/F"); take only
    // standalone single-letter tokens so a word like "PLACE" isn't mined for
    // letters.
    // After the marker the groups are a clean list (e.g. "C/D/E/F"); take only
    // standalone single-letter tokens so a word like "PLACE" isn't mined for
    // letters (this is also the path where the list can be empty).
    const groups = uniqueMatches(up.replace(/^.*?(?:THIRD(?:\s+PLACED?)?|3RD)/, ''), /\b[A-L]\b/g)
    if (groups.length > 0) return { kind: 'third', groups }
  }
  // Compact third: a leading "3" then only group letters/separators ("3CDEF",
  // "3 C/D/E/F", "3A"). The leading-3 anchor keeps "Winner 3" out.
  const compactThird = up.match(/^3[\s/]*([A-L][A-L/\s]*)$/)
  // The regex guarantees at least one group letter, so the list is never empty.
  if (compactThird) return { kind: 'third', groups: uniqueMatches(compactThird[1], /[A-L]/g) }

  // Compact rank "1A" / "2 B".
  const compact = up.match(/^([12])\s*([A-L])$/)
  if (compact) return rankRef(compact[1], compact[2])

  // Worded "Winner Group A" / "Runner-up B" / "1st A" / "2nd C".
  const rank = /RUNNER|2ND\b|SECOND/.test(up) ? '2' : /WINNER|1ST\b|FIRST/.test(up) ? '1' : null
  const group = up.match(/(?:GROUP\s*)?\b([A-L])\b/)?.[1]
  if (rank && group) return rankRef(rank, group)

  return { kind: 'other' }
}

function rankRef(rank: string, group: string): SlotRef {
  return rank === '2' ? { kind: 'runnerUp', group } : { kind: 'winner', group }
}

// Unique matches of a group-letter pattern, in order. The compact path passes
// /[A-L]/g (a packed run like "CDEF"); the worded path passes /\b[A-L]\b/g (only
// standalone letters, so a word like "PLACE" isn't mined) and can match nothing.
function uniqueMatches(text: string, re: RegExp): string[] {
  const out: string[] = []
  for (const m of text.match(re) ?? []) if (!out.includes(m)) out.push(m)
  return out
}

export interface ProjectInput {
  standings: GroupStandings[]
  // group letter -> every team in it has played at least once.
  groupReady: Record<string, boolean>
  // Best thirds that advance (8 for WC2026, 4 for Euro2024, 0 for top-2 formats).
  thirdsToQualify: number
  // Per-competition cross-group third-place criteria (no head-to-head - the teams
  // never met). Defaults to the classic points/GD/GF order.
  bestThird?: Criterion[]
}

// Cross-group ranking of third-placed teams by the competition's best-third
// criteria; group letter breaks any remaining tie so the projection is deterministic.
function rankThirds(input: ProjectInput): { code: string; name: string; group: string }[] {
  // Only called once every group is ready, so no per-group readiness check here.
  const thirds: (StandingRow & { group: string })[] = []
  for (const gs of input.standings) {
    const row = gs.rows[2]
    if (row?.code) thirds.push({ ...row, group: gs.group })
  }
  const cmp = compareByCriteria(input.bestThird ?? ['points', 'gd', 'gf'])
  thirds.sort((a, b) => cmp(a, b) || a.group.localeCompare(b.group))
  return thirds.map((t) => ({ code: t.code!, name: t.name, group: t.group }))
}

// Resolve each keyed slot to its currently-projected team. Group slots resolve
// from their own (ready) group; best-third slots are filled greedily from the
// globally-ranked qualifying thirds, each used once, restricted to the slot's
// eligible groups. Thirds need every group ready (the cross-group ranking is
// meaningless until all thirds are known). Slots that can't be projected are
// omitted - never guessed.
export function projectSlots(
  slots: { key: string; ref: SlotRef }[],
  input: ProjectInput,
): Map<string, ProjectedTeam> {
  const byGroup = new Map(input.standings.map((g) => [g.group, g]))
  const out = new Map<string, ProjectedTeam>()

  const resolveRank = (group: string, rank: number): ProjectedTeam | null => {
    if (!input.groupReady[group]) return null
    const row = byGroup.get(group)?.rows[rank - 1]
    return row?.code ? { code: row.code, name: row.name } : null
  }

  for (const { key, ref } of slots) {
    if (ref.kind === 'winner') {
      const t = resolveRank(ref.group, 1)
      if (t) out.set(key, t)
    } else if (ref.kind === 'runnerUp') {
      const t = resolveRank(ref.group, 2)
      if (t) out.set(key, t)
    }
  }

  // Best-third slots: only once every group is ready and the format uses thirds.
  const allReady = input.standings.length > 0 && input.standings.every((g) => input.groupReady[g.group])
  if (input.thirdsToQualify > 0 && allReady) {
    const qualifying = rankThirds(input).slice(0, input.thirdsToQualify)
    const thirdSlots = slots.filter(
      (s): s is { key: string; ref: Extract<SlotRef, { kind: 'third' }> } => s.ref.kind === 'third',
    )
    // A third is eligible for a slot if its group is listed (or any) AND it isn't
    // the slot's opponent group - so a third never plays its own group's
    // winner/runner-up again (no rematch).
    const eligible = (ref: Extract<SlotRef, { kind: 'third' }>, group: string) =>
      (ref.groups.length === 0 || ref.groups.includes(group)) && group !== ref.excludeGroup

    // Maximum bipartite matching (Kuhn) of slots to qualifying thirds. A slot is
    // often eligible for only ONE qualifying third - its other groups' thirds
    // didn't make the cut - so plain greedy can let a broader slot grab that one
    // option and starve it (real case: 3DEIJL where only D's third qualified).
    // Augmenting paths fill every slot that can be filled.
    const slotByKey = new Map(thirdSlots.map((s) => [s.key, s]))
    const takenBy = new Map<string, string>() // third code -> slot key holding it
    const augment = (slot: (typeof thirdSlots)[number], seen: Set<string>): boolean => {
      for (const t of qualifying) {
        if (!eligible(slot.ref, t.group) || seen.has(t.code)) continue
        seen.add(t.code)
        const holder = takenBy.get(t.code)
        if (holder === undefined || augment(slotByKey.get(holder)!, seen)) {
          takenBy.set(t.code, slot.key)
          return true
        }
      }
      return false
    }
    // Most-constrained first (fewest eligible qualifying thirds) keeps the result
    // stable and the search short; Kuhn finds a maximum either way.
    const options = (s: (typeof thirdSlots)[number]) => qualifying.filter((t) => eligible(s.ref, t.group)).length
    for (const slot of [...thirdSlots].sort((a, b) => options(a) - options(b))) augment(slot, new Set())

    const byCode = new Map(qualifying.map((t) => [t.code, t]))
    for (const [code, key] of takenBy) {
      const t = byCode.get(code)!
      out.set(key, { code: t.code, name: t.name })
    }
  }

  return out
}

// Overlay projected teams onto a knockout bracket from the live group standings.
// A side is projectable only when it has no official team yet (homeCode/awayCode
// null) and its placeholder resolves to a group position; the projected team is
// attached as homeProjectedCode/Team (the official fields stay untouched). A
// group projects once all its teams have played; best-third slots once every
// group has. thirdsToQualify is the number of third-placed slots in the bracket
// (each takes one of the top-ranked qualifying thirds), so no per-format table is
// hardcoded. Returns the bracket unchanged when nothing can be projected.
export function projectBracket(
  bracket: NormalizedBracket,
  standings: GroupStandings[],
  bestThird?: Criterion[],
): NormalizedBracket {
  const groupReady: Record<string, boolean> = {}
  for (const g of standings) groupReady[g.group] = g.rows.length > 0 && g.rows.every((r) => r.played >= 1)

  // The group a slot's opponent comes from (its winner/runner-up), so a third
  // facing it isn't drawn from that same group (no rematch).
  const opponentGroup = (ref: SlotRef) => (ref.kind === 'winner' || ref.kind === 'runnerUp' ? ref.group : undefined)
  const withExclude = (ref: SlotRef, oppGroup: string | undefined): SlotRef =>
    ref.kind === 'third' && oppGroup ? { ...ref, excludeGroup: oppGroup } : ref

  const slots: { key: string; ref: SlotRef }[] = []
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      const homeRef = parseSlotPlaceholder(m.homeTeam)
      const awayRef = parseSlotPlaceholder(m.awayTeam)
      if (!m.homeCode) slots.push({ key: `${m.providerMatchId}:home`, ref: withExclude(homeRef, opponentGroup(awayRef)) })
      if (!m.awayCode) slots.push({ key: `${m.providerMatchId}:away`, ref: withExclude(awayRef, opponentGroup(homeRef)) })
    }
  }
  const thirdsToQualify = slots.filter((s) => s.ref.kind === 'third').length
  const proj = projectSlots(slots, { standings, groupReady, thirdsToQualify, bestThird })
  if (proj.size === 0) return bracket

  return {
    ...bracket,
    rounds: bracket.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((m) => {
        const home = m.homeCode ? undefined : proj.get(`${m.providerMatchId}:home`)
        const away = m.awayCode ? undefined : proj.get(`${m.providerMatchId}:away`)
        if (!home && !away) return m
        return {
          ...m,
          ...(home ? { homeProjectedCode: home.code, homeProjectedTeam: home.name } : {}),
          ...(away ? { awayProjectedCode: away.code, awayProjectedTeam: away.name } : {}),
        }
      }),
    })),
  }
}
