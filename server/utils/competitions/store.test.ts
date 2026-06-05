import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import {
  ensureDefaultCompetition,
  getCompetitionById,
  getCompetitionBySlug,
  listActiveCompetitions,
  listCompetitions,
  resolveCompetition,
  setExternalSeasonId,
} from './store'
import { makeCompetition } from '../../../tests/factories'

describe('competition store', () => {
  it('seeds the default competition once', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultCompetition(db)
    await ensureDefaultCompetition(db)
    const all = await listCompetitions(db)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ slug: 'world-cup-2026', provider: 'fifa', externalCompetitionId: '17' })
    await client.close()
  })

  it('lists only active competitions and looks up by slug/id', async () => {
    const { db, client } = await createTestDb()
    const a = await makeCompetition(db, { slug: 'a', isActive: true })
    await makeCompetition(db, { slug: 'b', isActive: false })
    expect((await listActiveCompetitions(db)).map((c) => c.slug)).toEqual(['a'])
    expect((await getCompetitionBySlug(db, 'a'))?.id).toBe(a)
    expect((await getCompetitionById(db, a))?.slug).toBe('a')
    expect(await getCompetitionBySlug(db, 'missing')).toBeNull()
    expect(await getCompetitionById(db, 'missing')).toBeNull()
    await client.close()
  })

  it('caches the resolved season id', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { slug: 'a', externalSeasonId: null })
    await setExternalSeasonId(db, id, '999')
    expect((await getCompetitionById(db, id))?.externalSeasonId).toBe('999')
    await client.close()
  })

  it('resolves by slug or falls back to the first active, and null when empty', async () => {
    const { db, client } = await createTestDb()
    expect(await resolveCompetition(db, null)).toBeNull()
    const a = await makeCompetition(db, { slug: 'a' })
    const b = await makeCompetition(db, { slug: 'b' })
    expect((await resolveCompetition(db, 'b'))?.id).toBe(b)
    expect((await resolveCompetition(db, null))?.id).toBe(a)
    await client.close()
  })
})
