import type { GroupStandings } from '../stats/standings'
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
  | { kind: 'third'; groups: string[] }
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
}

// Cross-group ranking of third-placed teams (FIFA order: points, then goal
// difference, then goals for); group letter breaks any remaining tie so the
// projection is deterministic.
function rankThirds(input: ProjectInput): { code: string; name: string; group: string }[] {
  // Only called once every group is ready, so no per-group readiness check here.
  const thirds = []
  for (const gs of input.standings) {
    const row = gs.rows[2]
    if (row?.code) thirds.push({ ...row, code: row.code, group: gs.group })
  }
  thirds.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.group.localeCompare(b.group))
  return thirds.map((t) => ({ code: t.code, name: t.name, group: t.group }))
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
    const used = new Set<string>()
    // Assign the most-constrained slots first (fewest eligible groups; an
    // any-group slot last), so a slot that can only take group A's third isn't
    // starved by a broader slot grabbing it - greedy in input order could leave
    // a fillable slot empty. (Still an approximation of FIFA's fixed table; see
    // TODO.md.)
    const eligibility = (g: string[]) => (g.length === 0 ? Number.MAX_SAFE_INTEGER : g.length)
    const thirdSlots = slots
      .filter((s): s is { key: string; ref: Extract<SlotRef, { kind: 'third' }> } => s.ref.kind === 'third')
      .sort((a, b) => eligibility(a.ref.groups) - eligibility(b.ref.groups))
    for (const { key, ref } of thirdSlots) {
      const pick = qualifying.find(
        (t) => !used.has(t.code) && (ref.groups.length === 0 || ref.groups.includes(t.group)),
      )
      if (pick) {
        used.add(pick.code)
        out.set(key, { code: pick.code, name: pick.name })
      }
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
export function projectBracket(bracket: NormalizedBracket, standings: GroupStandings[]): NormalizedBracket {
  const groupReady: Record<string, boolean> = {}
  for (const g of standings) groupReady[g.group] = g.rows.length > 0 && g.rows.every((r) => r.played >= 1)

  const slots: { key: string; ref: SlotRef }[] = []
  for (const round of bracket.rounds) {
    for (const m of round.matches) {
      if (!m.homeCode) slots.push({ key: `${m.providerMatchId}:home`, ref: parseSlotPlaceholder(m.homeTeam) })
      if (!m.awayCode) slots.push({ key: `${m.providerMatchId}:away`, ref: parseSlotPlaceholder(m.awayTeam) })
    }
  }
  const thirdsToQualify = slots.filter((s) => s.ref.kind === 'third').length
  const proj = projectSlots(slots, { standings, groupReady, thirdsToQualify })
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
