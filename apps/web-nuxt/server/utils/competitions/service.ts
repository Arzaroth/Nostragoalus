import type { AppDatabase } from '../../../db/types'
import { ValidationError } from '../errors'
import { createCompetition, type NewCompetition } from './store'
import { probeCompetition, type ProbeDeps } from './probe'
import { rulesForSport } from '../scoring/config'
import { saveScoringConfig } from '../scoring/admin'

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
      providerSport: input.providerSport,
    },
    deps,
  )

  if (!probe.supported) {
    throw new ValidationError(`this competition cannot be ingested yet (${probe.blockers.join(', ')})`)
  }

  const row = await createCompetition(db, input)

  // A non-football competition gets its sport's scoring preset as an override
  // straight away. Left on the football default, a rugby competition would
  // score exact 27-24 calls as the headline tier and hand the top crowd-rarity
  // bonus to everyone who merely read the result - see rulesForSport. The
  // override is ordinary and admin-editable afterwards; seeding it is only
  // about not opening in a state nobody wants.
  if (row.sport !== 'FOOTBALL') {
    await saveScoringConfig(db, row.id, rulesForSport(row.sport))
  }

  return row
}
