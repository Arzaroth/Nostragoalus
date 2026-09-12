import type { AppDatabase } from '../../../db/types'
import { ValidationError } from '../errors'
import { createCompetition, type NewCompetition } from './store'
import { probeCompetition, type ProbeDeps } from './probe'

// Adding a competition is probe-then-create, and the order is the feature's
// whole guarantee: the season is re-read here rather than trusting a verdict the
// client says it got, so nothing the app cannot ingest reaches the competition
// table. It lives in the service rather than the route because that guarantee is
// what the coverage gate has to hold onto - server/api is not covered.
export async function addCompetition(db: AppDatabase, input: NewCompetition, deps: ProbeDeps = {}) {
  const probe = await probeCompetition(
    {
      provider: input.provider,
      externalCompetitionId: input.externalCompetitionId,
      seasonHint: input.seasonHint,
    },
    deps,
  )

  if (!probe.supported) {
    throw new ValidationError(`this competition cannot be ingested yet (${probe.blockers.join(', ')})`)
  }

  return createCompetition(db, input)
}
