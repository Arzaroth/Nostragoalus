// Vectors for the play-by-play labelling a client renders from the feed:
// `pbpTextSpec` (kind -> i18n key + params), the timeline icon table, the
// goal-kind predicate, and the SHOUTED-name formatter they lean on. All literal,
// so bless is idempotent.
interface RawCase {
  fn: string
  args: unknown[]
}

// Every kind the feed emits, incl. the ones with no icon (foul, corner) and one
// the client has never heard of.
const KINDS = [
  'goal',
  'own-goal',
  'penalty-goal',
  'penalty-missed',
  'penalty-awarded',
  'assist',
  'yellow',
  'red',
  'second-yellow',
  'sub',
  'shot',
  'foul',
  'corner',
  'var',
  'period',
  'meteorite',
]

const PERIOD_KINDS = [
  'kickoff',
  'half-time',
  'second-half',
  'second-half-end',
  'extra-time',
  'extra-time-end',
  'full-time',
  'mystery',
  null,
]

export async function buildCases(): Promise<RawCase[]> {
  const cases: RawCase[] = []

  for (const kind of KINDS) {
    cases.push({ fn: 'timelineIcon', args: [kind] })
    cases.push({ fn: 'isGoalKind', args: [kind] })
    // nameless: the fallback label per kind
    cases.push({ fn: 'pbpTextSpec', args: [{ kind }] })
    // with an actor: only the player-actor kinds template it in
    cases.push({ fn: 'pbpTextSpec', args: [{ kind, playerName: 'VAN DIJK' }] })
  }

  // Period markers, incl. an unmapped one and a missing one.
  for (const periodKind of PERIOD_KINDS) {
    cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'period', periodKind }] })
  }

  // Substitutions: both names, one name (degrades to the bare label), neither.
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'sub', playerInName: 'MUSIALA', playerOutName: 'Thomas MÜLLER' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'sub', playerInName: 'MUSIALA' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'sub', playerOutName: 'MUSIALA' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'sub', playerInName: '', playerOutName: '' }] })

  // VAR: the feed's pre-localized decision text wins over any key.
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'var', text: 'Goal cancelled - offside' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'var', text: '' }] })

  // Shootout entries (the feed reuses the penalty kinds) and an own goal.
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'penalty-goal', playerName: 'PALMER' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'penalty-missed', playerName: 'SAKA' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'own-goal', playerName: "Riccardo CALAFIORI" }] })
  // penalty-awarded has no player template: the actor is dropped.
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'penalty-awarded', playerName: 'KANE' }] })
  cases.push({ fn: 'pbpTextSpec', args: [{ kind: 'goal', playerName: '' }] })

  for (const name of [
    'VAN DIJK',
    "O'NEILL",
    'DE-BRUYNE',
    'Kylian MBAPPÉ',
    'Kylian Mbappé',
    'A',
    'A B',
    'DE LA FUENTE',
    '',
    null,
  ]) {
    cases.push({ fn: 'formatPlayerName', args: [name] })
  }

  return cases
}
