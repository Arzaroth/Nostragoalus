import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeCompetition, makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { match } from '../../../db/schema'
import { listCompetitionOddsProviders, setCompetitionOddsProvider, ODDS_PROVIDERS } from './provider-config'
import { NotFoundError, ValidationError } from '../errors'

describe('odds provider config', () => {
  it('lists every competition with its provider, plus the provider catalog', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'wc', name: 'WC', oddsProvider: 'sofascore', oddsProviderRef: '16' })
    const { providers, competitions } = await listCompetitionOddsProviders(db)
    expect(providers).toEqual(ODDS_PROVIDERS)
    expect(providers.find((p) => p.key === 'sofascore')?.fetchesOdds).toBe(true)
    expect(providers.find((p) => p.key === 'betexplorer')?.fetchesOdds).toBe(false)
    expect(competitions).toHaveLength(1)
    expect(competitions[0]).toMatchObject({ slug: 'wc', oddsProvider: 'sofascore', oddsProviderRef: '16' })
    await client.close()
  })

  it('switches a competition to another provider and ref', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { slug: 'wc', oddsProvider: 'sofascore', oddsProviderRef: '16' })
    const row = await setCompetitionOddsProvider(db, id, 'betexplorer', 'world-championship-2026')
    expect(row).toMatchObject({ id, oddsProvider: 'betexplorer', oddsProviderRef: 'world-championship-2026' })
    const { competitions } = await listCompetitionOddsProviders(db)
    expect(competitions[0]).toMatchObject({ oddsProvider: 'betexplorer', oddsProviderRef: 'world-championship-2026' })
    await client.close()
  })

  it('a null ref unsets the event ref (disables polling for that competition)', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { oddsProvider: 'sofascore', oddsProviderRef: '16' })
    const row = await setCompetitionOddsProvider(db, id, 'sofascore', null)
    expect(row.oddsProviderRef).toBeNull()
    await client.close()
  })

  it('coerces an empty/whitespace ref to null', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { oddsProvider: 'sofascore', oddsProviderRef: '16' })
    expect((await setCompetitionOddsProvider(db, id, 'sofascore', '   ')).oddsProviderRef).toBeNull()
    await client.close()
  })

  it('clears the per-match event mapping when the provider changes', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db, { oddsProvider: 'sofascore', oddsProviderRef: '16' })
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T18:00:00Z') })
    await db.update(match).set({ oddsEventRef: 'sofa-777', oddsEventSwapped: true }).where(eq(match.id, matchId))

    await setCompetitionOddsProvider(db, competitionId, 'betexplorer', 'world-championship-2026')

    const [m] = await db.select({ ref: match.oddsEventRef, swapped: match.oddsEventSwapped }).from(match).where(eq(match.id, matchId))
    expect(m.ref).toBeNull()
    expect(m.swapped).toBe(false)
    await client.close()
  })

  it('keeps the per-match mapping when only the ref changes (same provider)', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db, { oddsProvider: 'sofascore', oddsProviderRef: '16' })
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T18:00:00Z') })
    await db.update(match).set({ oddsEventRef: 'sofa-777', oddsEventSwapped: true }).where(eq(match.id, matchId))

    await setCompetitionOddsProvider(db, competitionId, 'sofascore', '99')

    const [m] = await db.select({ ref: match.oddsEventRef, swapped: match.oddsEventSwapped }).from(match).where(eq(match.id, matchId))
    expect(m.ref).toBe('sofa-777')
    expect(m.swapped).toBe(true)
    await client.close()
  })

  it('rejects an unknown provider', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db)
    await expect(setCompetitionOddsProvider(db, id, 'pinnacle' as never, '1')).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws when the competition does not exist', async () => {
    const { db, client } = await createTestDb()
    await expect(setCompetitionOddsProvider(db, 'missing-id', 'sofascore', '1')).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})
