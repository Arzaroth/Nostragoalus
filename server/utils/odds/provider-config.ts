import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AppDatabase } from '../../../db/types'
import { competition, match } from '../../../db/schema'
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
  const existing = await db
    .select({ oddsProvider: competition.oddsProvider })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1)
  if (!existing[0]) throw new NotFoundError('competition not found')
  // The service is the contract layer (the route's zod min(1) coercion isn't the
  // only caller), so normalise an empty/whitespace ref to null here too.
  const ref = providerRef?.trim() || null
  const providerChanged = existing[0].oddsProvider !== provider

  const updated = await db
    .update(competition)
    .set({ oddsProvider: provider, oddsProviderRef: ref })
    .where(eq(competition.id, competitionId))
    .returning({ id: competition.id, slug: competition.slug, name: competition.name, oddsProvider: competition.oddsProvider, oddsProviderRef: competition.oddsProviderRef })

  // Switching providers invalidates the per-match event mapping: oddsEventRef is
  // the OLD provider's foreign id and would mis-resolve (or mis-orient via
  // oddsEventSwapped) under the new one. Clear it so the next poll re-maps from
  // scratch. A same-provider ref edit keeps the mapping (no needless re-map).
  if (providerChanged) {
    await db.update(match).set({ oddsEventRef: null, oddsEventSwapped: false }).where(eq(match.competitionId, competitionId))
  }
  return updated[0]!
}
