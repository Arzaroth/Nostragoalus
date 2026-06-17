import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeCompetition } from '../../../tests/factories'
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
