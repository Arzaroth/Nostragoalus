import { eq, desc, and, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition } from '../../../db/schema'

export const DEFAULT_COMPETITIONS = [
  {
    slug: 'world-cup-2026',
    name: 'FIFA World Cup 2026',
    provider: 'fifa',
    externalCompetitionId: '17',
    externalSeasonId: null as string | null,
    seasonHint: '2026',
    oddsProvider: 'sofascore' as string | null,
    oddsProviderRef: '16' as string | null,
  },
  {
    slug: 'world-cup-2022',
    name: 'FIFA World Cup 2022',
    provider: 'fifa',
    externalCompetitionId: '17',
    externalSeasonId: '255711' as string | null,
    seasonHint: '2022',
    oddsProvider: 'sofascore' as string | null,
    oddsProviderRef: '16' as string | null,
  },
  {
    slug: 'euro-2024',
    name: 'UEFA Euro 2024',
    provider: 'uefa',
    externalCompetitionId: '3',
    externalSeasonId: null as string | null,
    seasonHint: '2024',
    oddsProvider: 'sofascore' as string | null,
    oddsProviderRef: '1' as string | null,
  },
]

// Idempotent per slug, so new defaults are added on upgrade without duplicates.
// Existing rows that predate the odds columns get them backfilled (only while
// both are still null, so an admin override is never clobbered).
export async function ensureDefaultCompetition(db: AppDatabase): Promise<void> {
  for (const def of DEFAULT_COMPETITIONS) {
    const existing = await db.select({ id: competition.id }).from(competition).where(eq(competition.slug, def.slug)).limit(1)
    if (existing.length === 0) {
      await db.insert(competition).values({ ...def, isActive: true })
    } else if (def.oddsProvider) {
      await db
        .update(competition)
        .set({ oddsProvider: def.oddsProvider, oddsProviderRef: def.oddsProviderRef })
        .where(and(eq(competition.id, existing[0].id), isNull(competition.oddsProvider), isNull(competition.oddsProviderRef)))
    }
  }
}

export async function listCompetitions(db: AppDatabase) {
  return db.select().from(competition).orderBy(competition.createdAt)
}

export async function listActiveCompetitions(db: AppDatabase) {
  // Newest season first - the picker leads with the current tournament.
  return db.select().from(competition).where(eq(competition.isActive, true)).orderBy(desc(competition.seasonHint))
}

export async function getCompetitionBySlug(db: AppDatabase, slug: string) {
  const rows = await db.select().from(competition).where(eq(competition.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function getCompetitionById(db: AppDatabase, id: string) {
  const rows = await db.select().from(competition).where(eq(competition.id, id)).limit(1)
  return rows[0] ?? null
}

export async function setExternalSeasonId(db: AppDatabase, id: string, externalSeasonId: string): Promise<void> {
  await db.update(competition).set({ externalSeasonId }).where(eq(competition.id, id))
}

// Resolve a competition by slug, or fall back to the first active one (for the
// default view when no competition is specified).
export async function resolveCompetition(db: AppDatabase, slug?: string | null) {
  if (slug) return getCompetitionBySlug(db, slug)
  const active = await listActiveCompetitions(db)
  return active[0] ?? null
}
