import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AppDatabase } from '../../../db/types'
import { competition } from '../../../db/schema'
import { listCompetitions } from '../competitions/store'
import { NotFoundError, ValidationError } from '../errors'
import type { OddsProviderKey } from '../../../shared/types/odds'

// The odds providers the app knows about. `fetchesOdds` says whether the
// provider can actually deliver 1X2 over plain HTTP: Sofascore exposes a JSON
// feed, but BetExplorer renders its odds client-side only (the page ships no
// server-rendered odds and the sole AJAX endpoint is the dropping-odds filter),
// so selecting it lists fixtures but never prices them without a headless
// browser. The admin UI surfaces this so the choice is informed.
export const ODDS_PROVIDERS: { key: OddsProviderKey; fetchesOdds: boolean }[] = [
  { key: 'sofascore', fetchesOdds: true },
  { key: 'betexplorer', fetchesOdds: false },
]

export const ODDS_PROVIDER_KEYS = ODDS_PROVIDERS.map((p) => p.key) as [OddsProviderKey, ...OddsProviderKey[]]

export const setOddsProviderSchema = z.object({
  competition: z.string().min(1),
  provider: z.enum(ODDS_PROVIDER_KEYS),
  // Provider-specific event ref (e.g. Sofascore's unique tournament id). Null
  // unsets it; the next poll then has no anchor and the competition is skipped.
  providerRef: z.string().min(1).max(64).nullable(),
})

export interface CompetitionOddsRow {
  id: string
  slug: string
  name: string
  oddsProvider: string | null
  oddsProviderRef: string | null
}

export interface OddsProviderList {
  providers: { key: OddsProviderKey; fetchesOdds: boolean }[]
  competitions: CompetitionOddsRow[]
}

export async function listCompetitionOddsProviders(db: AppDatabase): Promise<OddsProviderList> {
  const comps = await listCompetitions(db)
  return {
    providers: ODDS_PROVIDERS,
    competitions: comps.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      oddsProvider: c.oddsProvider,
      oddsProviderRef: c.oddsProviderRef,
    })),
  }
}

// Point a competition at an odds provider (and its event ref). Validated even
// though the route's zod guards the same enum - the service is the layer under
// coverage and the one other callers reach.
export async function setCompetitionOddsProvider(
  db: AppDatabase,
  competitionId: string,
  provider: OddsProviderKey,
  providerRef: string | null,
): Promise<CompetitionOddsRow> {
  if (!ODDS_PROVIDER_KEYS.includes(provider)) throw new ValidationError(`unknown odds provider: ${provider}`)
  const updated = await db
    .update(competition)
    .set({ oddsProvider: provider, oddsProviderRef: providerRef })
    .where(eq(competition.id, competitionId))
    .returning({ id: competition.id, slug: competition.slug, name: competition.name, oddsProvider: competition.oddsProvider, oddsProviderRef: competition.oddsProviderRef })
  const row = updated[0]
  if (!row) throw new NotFoundError('competition not found')
  return row
}
