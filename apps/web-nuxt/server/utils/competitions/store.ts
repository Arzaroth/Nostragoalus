import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition } from '../../../db/schema'
import { FALLBACK_COMPETITION } from '../../../shared/competition'
import { getAppSetting, setAppSetting } from '../settings/service'
import { ConflictError, NotFoundError, ValidationError } from '../errors'

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
  // Newest season first - the picker leads with the current tournament, and
  // getDefaultCompetitionSlug takes the head of this list when no default is
  // set. NULLS LAST is load-bearing: season_hint is nullable and Postgres sorts
  // nulls FIRST on DESC, so a season-less competition would otherwise lead the
  // switcher and quietly become the app-wide default. Ties break on the unique
  // slug rather than createdAt: two competitions sharing a season are ordered
  // the same way on every query, where createdAt would order them by however
  // the inserts happened to land in time - which is not something the head of
  // this list, and therefore the default competition, should depend on.
  return db
    .select()
    .from(competition)
    .where(eq(competition.isActive, true))
    .orderBy(sql`${competition.seasonHint} desc nulls last`, competition.slug)
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
export async function getDefaultCompetitionSlug(
  db: AppDatabase,
  // The caller often has this already (the competitions endpoint returns the
  // same list); passing it in saves resolving the active set twice per request.
  known?: { slug: string }[],
): Promise<string> {
  const active = known ?? (await listActiveCompetitions(db))
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

// A slug is permanent once created: it is in every URL, the ng-competition
// cookie, share images and push deep-links, so renaming it breaks links that are
// already out in the world. Validated hard at creation for the same reason.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface NewCompetition {
  slug: string
  name: string
  provider: string
  externalCompetitionId: string
  seasonHint: string | null
}

export async function createCompetition(db: AppDatabase, input: NewCompetition) {
  if (!SLUG_RE.test(input.slug)) {
    throw new ValidationError('slug must be lowercase letters, digits and single hyphens')
  }
  const clash = await getCompetitionBySlug(db, input.slug)
  if (clash) throw new ConflictError('a competition already uses that slug')

  const [row] = await db
    .insert(competition)
    .values({
      slug: input.slug,
      name: input.name,
      provider: input.provider,
      externalCompetitionId: input.externalCompetitionId,
      externalSeasonId: null,
      seasonHint: input.seasonHint,
      isActive: true,
    })
    .returning()
  return row
}

// Archiving, not deleting: competition cascades into round, match,
// competition_award, user_achievement and showcase_pin, with leagues and chat
// hanging off it, so a delete would take a tournament's whole history with it.
// isActive=false already hides it from the switcher and the default resolver.
export async function setCompetitionActive(db: AppDatabase, slug: string, isActive: boolean) {
  const target = await getCompetitionBySlug(db, slug)
  if (!target) throw new NotFoundError('competition not found')
  const [row] = await db.update(competition).set({ isActive }).where(eq(competition.id, target.id)).returning()
  return row
}
