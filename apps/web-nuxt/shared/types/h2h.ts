// Head-to-head: two players compared over the matches they have both had
// scored in one competition. Like personal analytics this is NOT gated on the
// final - it reads whatever shared scored picks exist so far.

export interface H2HPlayer {
  id: string
  name: string
  image: string | null
}

export interface H2HMatch {
  matchId: string
  home: string
  away: string
  homeCode: string | null
  awayCode: string | null
  actual: string
  aPredicted: string
  bPredicted: string
  aPoints: number
  bPoints: number
  // 'a' | 'b' | 'tie' - who scored more on this match.
  winner: 'a' | 'b' | 'tie'
  // The two picked different outcomes (home/draw/away).
  diverged: boolean
}

export interface H2HRoundPoints {
  label: string
  order: number
  // Cumulative points each player had after this round, over shared matches.
  aPoints: number
  bPoints: number
}

export interface H2HResponse {
  competitionName: string
  a: H2HPlayer
  b: H2HPlayer
  // Matches both players have a scored pick for.
  shared: number
  // True when there are no shared scored matches yet: the page shows an empty state.
  hasData: boolean
  aPoints: number
  bPoints: number
  // Per-match wins over shared matches (higher points takes it).
  aWins: number
  bWins: number
  ties: number
  agreement: {
    // Shared matches where both picked the exact same scoreline.
    sameScore: number
    // Shared matches where both picked the same outcome (home/draw/away).
    sameOutcome: number
  }
  // Cumulative points per round, for the lead chart.
  overTime: H2HRoundPoints[]
  // The shared matches where the two diverged most on points, biggest gap first.
  divergences: H2HMatch[]
}
