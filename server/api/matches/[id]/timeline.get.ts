import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { providerForCompetition } from '../../../utils/providers'
import { getCompetitionById } from '../../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../../utils/sync/competition'

// Finished timelines never change again - cache for the process lifetime. Live
// matches refresh every minute so new events show up. (Single instance: an
// in-memory map is enough.)
const cache = new Map<string, { at: number; final: boolean; events: unknown }>()
const TTL_MS = 60 * 1000

// Locales the FIFA feed actually localizes its commentary for - only these get
// the VAR decision text; others fall back to our generic "VAR" label. Cached per
// language so one locale's text isn't served to another.
const FIFA_PBP_LANGS = new Set(['en', 'fr'])

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const locale = getCookie(event, 'ng_locale') || 'en'
  const lang = FIFA_PBP_LANGS.has(locale) ? locale : null
  const cacheKey = `${id}:${lang ?? 'none'}`
  const cached = cache.get(cacheKey)
  if (cached && (cached.final || Date.now() - cached.at < TTL_MS)) return { events: cached.events }

  const rows = await db
    .select({ providerMatchId: match.providerMatchId, providerStageId: match.providerStageId, competitionId: match.competitionId, status: match.status })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows.length === 0) return { events: [] }

  const competition = await getCompetitionById(db, rows[0].competitionId)
  if (!competition) return { events: [] }
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getMatchTimeline) return { events: [] }

  try {
    // The timeline tags each event with a provider team id and player ids; the
    // detail resolves home/away (to lace events onto the right side) and the
    // roster names (to phrase the commentary ourselves, localized).
    const detail = provider.getMatchDetail
      ? await provider.getMatchDetail({ stageId: rows[0].providerStageId ?? undefined, matchId: rows[0].providerMatchId })
      : null
    const events = await provider.getMatchTimeline({
      matchId: rows[0].providerMatchId,
      homeTeamId: detail?.homeTeamId,
      awayTeamId: detail?.awayTeamId,
      playerNames: detail?.playerNames,
      language: lang,
    })
    // Only freeze the cache for a finished match once it actually has events; a
    // transient empty result must stay refetchable rather than stick forever.
    cache.set(cacheKey, { at: Date.now(), final: rows[0].status === 'FINISHED' && events.length > 0, events })
    return { events }
  } catch {
    return { events: [] }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match play-by-play timeline",
    "description": "Curated minute-by-minute events (goals, cards, subs, shots, penalties, VAR, period markers) from the upstream feed, newest first. Cached one minute while live, for the process lifetime once finished.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Internal match id (UUID).",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Curated, newest-first event list (empty when the provider has nothing)."
      }
    }
  },
})
