import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { competition } from '../../../db/schema'
import {
  DEFAULT_COMPETITION_KEY,
  ensureDefaultCompetition,
  getCompetitionById,
  getCompetitionBySlug,
  createCompetition,
  getDefaultCompetitionSlug,
  listActiveCompetitions,
  listCompetitions,
  resolveCompetition,
  setCompetitionActive,
  setDefaultCompetitionSlug,
  setExternalSeasonId,
} from './store'
import { FALLBACK_COMPETITION } from '../../../shared/competition'
import { getAppSetting, setAppSetting } from '../settings/service'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import { makeCompetition } from '../../../tests/factories'

describe('competition store', () => {
  it('seeds the default competitions once (idempotent per slug)', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultCompetition(db)
    await ensureDefaultCompetition(db)
    const all = await listCompetitions(db)
    expect(all.map((c) => c.slug).sort()).toEqual(['euro-2024', 'world-cup-2022', 'world-cup-2026'])
    expect(all.find((c) => c.slug === 'world-cup-2026')).toMatchObject({ provider: 'fifa', externalCompetitionId: '17' })
    expect(all.find((c) => c.slug === 'world-cup-2022')).toMatchObject({ provider: 'fifa', externalSeasonId: '255711' })
    expect(all.find((c) => c.slug === 'euro-2024')).toMatchObject({ provider: 'uefa', externalCompetitionId: '3' })
    await client.close()
  })

  it('never touches existing rows - clearing the odds columns disables odds for good', async () => {
    const { db, client } = await createTestDb()
    // An admin cleared the columns to stop odds polling (rows that predate the
    // odds columns were backfilled once by migration 0015, not at runtime).
    await makeCompetition(db, { slug: 'world-cup-2026', oddsProvider: null, oddsProviderRef: null })
    await ensureDefaultCompetition(db)
    expect(await getCompetitionBySlug(db, 'world-cup-2026')).toMatchObject({
      oddsProvider: null,
      oddsProviderRef: null,
    })
    // Missing defaults are still inserted (with their odds config).
    expect(await getCompetitionBySlug(db, 'euro-2024')).toMatchObject({
      oddsProvider: 'sofascore',
      oddsProviderRef: '1',
    })

    // Any other override survives subsequent runs too.
    const { competition } = await import('../../../db/schema')
    const { eq } = await import('drizzle-orm')
    await db.update(competition).set({ oddsProvider: 'betexplorer', oddsProviderRef: 'x' }).where(eq(competition.slug, 'world-cup-2026'))
    await ensureDefaultCompetition(db)
    expect(await getCompetitionBySlug(db, 'world-cup-2026')).toMatchObject({
      oddsProvider: 'betexplorer',
      oddsProviderRef: 'x',
    })
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
    // Same season, so the unique slug decides - deterministically, whatever
    // order the two inserts happened to land in.
    expect((await resolveCompetition(db, null))?.id).toBe(a)
    await client.close()
  })
})

it('lists competitions newest season first', async () => {
  const { db, client } = await createTestDb()
  await ensureDefaultCompetition(db)
  const all = await listActiveCompetitions(db)
  expect(all.map((c) => c.slug)).toEqual(['world-cup-2026', 'euro-2024', 'world-cup-2022'])
  await client.close()
})

describe('default competition', () => {
  it('falls back to the compiled-in constant when there is no competition at all', async () => {
    const { db, client } = await createTestDb()
    expect(await getDefaultCompetitionSlug(db)).toBe(FALLBACK_COMPETITION)
    await client.close()
  })

  it('unset: picks the newest active season', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'old-cup', seasonHint: '2022' })
    await makeCompetition(db, { slug: 'new-cup', seasonHint: '2026' })
    expect(await getDefaultCompetitionSlug(db)).toBe('new-cup')
    await client.close()
  })

  it('set: wins over the newest active season', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'old-cup', seasonHint: '2022' })
    await makeCompetition(db, { slug: 'new-cup', seasonHint: '2026' })
    await setDefaultCompetitionSlug(db, 'old-cup')
    expect(await getDefaultCompetitionSlug(db)).toBe('old-cup')
    expect(await getAppSetting(db, DEFAULT_COMPETITION_KEY)).toBe('old-cup')
    await client.close()
  })

  // The guard that matters: archiving the default would otherwise 404 every
  // slug-less landing, because the stored slug is no longer routable.
  it('ignores a stored slug once that competition is archived', async () => {
    const { db, client } = await createTestDb()
    const archivedId = await makeCompetition(db, { slug: 'old-cup', seasonHint: '2022' })
    await makeCompetition(db, { slug: 'new-cup', seasonHint: '2026' })
    await setDefaultCompetitionSlug(db, 'old-cup')
    await db.update(competition).set({ isActive: false }).where(eq(competition.id, archivedId))
    expect(await getDefaultCompetitionSlug(db)).toBe('new-cup')
    await client.close()
  })

  it('ignores a stored slug that no longer names any competition', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'new-cup', seasonHint: '2026' })
    await setAppSetting(db, DEFAULT_COMPETITION_KEY, 'deleted-cup')
    expect(await getDefaultCompetitionSlug(db)).toBe('new-cup')
    await client.close()
  })

  it('refuses to store an unknown or archived slug', async () => {
    const { db, client } = await createTestDb()
    const archivedId = await makeCompetition(db, { slug: 'archived-cup', seasonHint: '2022' })
    await db.update(competition).set({ isActive: false }).where(eq(competition.id, archivedId))
    await expect(setDefaultCompetitionSlug(db, 'nope')).rejects.toThrow(NotFoundError)
    await expect(setDefaultCompetitionSlug(db, 'archived-cup')).rejects.toThrow(NotFoundError)
    expect(await getAppSetting(db, DEFAULT_COMPETITION_KEY)).toBeNull()
    await client.close()
  })
})

describe('createCompetition', () => {
  it('inserts an active competition with its provider binding', async () => {
    const { db, client } = await createTestDb()
    const row = await createCompetition(db, {
      slug: 'euro-2028',
      name: 'UEFA Euro 2028',
      provider: 'espn',
      externalCompetitionId: 'uefa.euro',
      seasonHint: '2028',
    })
    expect(row).toMatchObject({
      slug: 'euro-2028',
      name: 'UEFA Euro 2028',
      provider: 'espn',
      externalCompetitionId: 'uefa.euro',
      seasonHint: '2028',
      isActive: true,
      externalSeasonId: null,
    })
    expect((await listActiveCompetitions(db)).map((c) => c.slug)).toContain('euro-2028')
    await client.close()
  })

  // The slug is permanent and lands in every URL, cookie and share link, so a
  // malformed one is refused at creation rather than lived with forever.
  it('refuses a slug that is not a clean URL segment', async () => {
    const { db, client } = await createTestDb()
    for (const bad of ['Euro 2028', 'euro_2028', 'euro--2028', '-euro', 'euro-', 'EURO', 'éuro', '']) {
      await expect(
        createCompetition(db, { slug: bad, name: 'x', provider: 'espn', externalCompetitionId: 'x', seasonHint: null }),
      ).rejects.toThrow(ValidationError)
    }
    expect(await listCompetitions(db)).toHaveLength(0)
    await client.close()
  })

  it('refuses a slug another competition already holds', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'euro-2028' })
    await expect(
      createCompetition(db, { slug: 'euro-2028', name: 'x', provider: 'espn', externalCompetitionId: 'x', seasonHint: null }),
    ).rejects.toThrow(ConflictError)
    await client.close()
  })

  it('accepts a null season hint', async () => {
    const { db, client } = await createTestDb()
    const row = await createCompetition(db, {
      slug: 'some-cup',
      name: 'Some Cup',
      provider: 'espn',
      externalCompetitionId: 'x',
      seasonHint: null,
    })
    expect(row.seasonHint).toBeNull()
    await client.close()
  })
})

describe('setCompetitionActive', () => {
  it('archives and restores, leaving the row and its history in place', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'old-cup', seasonHint: '2018' })

    const archived = await setCompetitionActive(db, 'old-cup', false)
    expect(archived.isActive).toBe(false)
    expect((await listActiveCompetitions(db)).map((c) => c.slug)).not.toContain('old-cup')
    // Archiving hides it, it does not delete it.
    expect((await listCompetitions(db)).map((c) => c.slug)).toContain('old-cup')

    const restored = await setCompetitionActive(db, 'old-cup', true)
    expect(restored.isActive).toBe(true)
    expect((await listActiveCompetitions(db)).map((c) => c.slug)).toContain('old-cup')
    await client.close()
  })

  it('404s on an unknown slug', async () => {
    const { db, client } = await createTestDb()
    await expect(setCompetitionActive(db, 'nope', false)).rejects.toThrow(NotFoundError)
    await client.close()
  })

  // Archiving the default must not strand slug-less links on a dead competition.
  it('hands the default on when the current default is archived', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'old-cup', seasonHint: '2022' })
    await makeCompetition(db, { slug: 'new-cup', seasonHint: '2026' })
    await setDefaultCompetitionSlug(db, 'old-cup')
    expect(await getDefaultCompetitionSlug(db)).toBe('old-cup')

    await setCompetitionActive(db, 'old-cup', false)
    expect(await getDefaultCompetitionSlug(db)).toBe('new-cup')
    await client.close()
  })
})

describe('active competition ordering', () => {
  // season_hint is nullable and Postgres sorts nulls FIRST on DESC, so without
  // NULLS LAST a season-less competition would lead the switcher and quietly
  // become the app-wide default.
  it('sorts a season-less competition last, not first', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'no-season', seasonHint: null })
    await makeCompetition(db, { slug: 'wc-2026', seasonHint: '2026' })
    await makeCompetition(db, { slug: 'euro-2024', seasonHint: '2024' })

    expect((await listActiveCompetitions(db)).map((c) => c.slug)).toEqual(['wc-2026', 'euro-2024', 'no-season'])
    expect(await getDefaultCompetitionSlug(db)).toBe('wc-2026')
    await client.close()
  })

  it('takes a caller-supplied active list rather than resolving it twice', async () => {
    const { db, client } = await createTestDb()
    await makeCompetition(db, { slug: 'wc-2026', seasonHint: '2026' })
    expect(await getDefaultCompetitionSlug(db, [{ slug: 'handed-in' }])).toBe('handed-in')
    await client.close()
  })
})
