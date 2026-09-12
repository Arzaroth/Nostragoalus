import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition } from '../../../db/schema'
import { FALLBACK_COMPETITION } from '../../../shared/competition'
import { getAppSetting, setAppSetting } from '../settings/service'
import { NotFoundError } from '../errors'

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
// Strictly insert-only: rows that predate the odds columns were backfilled once
// by migration 0015, so an admin clearing odds_provider/odds_provider_ref
// genuinely disables odds for that competition (no hourly re-seeding).
export async function ensureDefaultCompetition(db: AppDatabase): Promise<void> {
  for (const def of DEFAULT_COMPETITIONS) {
    const existing = await db.select({ id: competition.id }).from(competition).where(eq(competition.slug, def.slug)).limit(1)
    if (existing.length === 0) {
      await db.insert(competition).values({ ...def, isActive: true })
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

// The competition a slug-less context lands on (the "/" redirect, a global
// achievement's deep link, a first visit with no cookie). Admin-set, stored as
// a slug rather than an id so it survives a reseed and reads plainly in the
// settings table.
export const DEFAULT_COMPETITION_KEY = 'default_competition'

// Never trusted blindly: a competition that was archived or deleted after being
// set as default would 404 every landing, so the stored slug only wins while it
// names an active competition. Falls back to the newest active season, and to
// the compiled-in constant only when there is no competition at all.
export async function getDefaultCompetitionSlug(db: AppDatabase): Promise<string> {
  const active = await listActiveCompetitions(db)
  if (active.length === 0) return FALLBACK_COMPETITION

  const configured = await getAppSetting(db, DEFAULT_COMPETITION_KEY)
  if (configured && active.some((c) => c.slug === configured)) return configured

  return active[0]!.slug
}

// Rejects an unknown or archived slug at write time too: storing one would be
// silently ignored by the getter, which reads as "the setting did not save".
export async function setDefaultCompetitionSlug(db: AppDatabase, slug: string): Promise<void> {
  const target = await getCompetitionBySlug(db, slug)
  if (!target) throw new NotFoundError('competition not found')
  if (!target.isActive) throw new NotFoundError('competition is archived')
  await setAppSetting(db, DEFAULT_COMPETITION_KEY, slug)
}
