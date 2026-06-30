import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { providerForCompetition } from '../../utils/providers'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { resolveCompetitionSeason, syncLive } from '../../utils/sync/competition'
import { hasLiveWindow } from '../../utils/sync/live-window'
import { publishMatchUpdates } from '../../utils/live/hub'
import { notifyLiveMatchEvents } from '../../utils/push/live'
import { invalidateBracketCache } from '../../utils/bracket/cache'
import { isKnockout } from '../../../shared/types/match'

export default defineTask({
  meta: { name: 'scores:poll', description: 'Poll live scores for active competitions while matches are live' },
  async run({ payload }) {
    return recordTaskRun(db, 'scores:poll', async () => {
    if (cronDisabled(useRuntimeConfig().cronEnabled, payload)) return { result: 'disabled' }
    if (!(await hasLiveWindow(db))) return { result: 'idle' }

    const changed: string[] = []
    for (const competition of await listActiveCompetitions(db)) {
      try {
        const seasonId = await resolveCompetitionSeason(db, competition)
        const provider = providerForCompetition(competition, seasonId)
        const res = await syncLive(db, competition.id, provider)
        changed.push(...res.changedMatchIds)
        // A knockout match finishing advances the winner into the next bracket
        // slot, which lives in the cached provider base - drop it so the next
        // bracket request rebuilds with the advancement instead of waiting out
        // the TTL. The live scoreline itself rides the WS patch, not this.
        if (res.transitions.some((t) => t.status === 'FINISHED' && isKnockout(t.stage))) {
          invalidateBracketCache(competition.id)
        }
        // Best-effort live push (kickoff/goal) to predictors; never blocks scores.
        await notifyLiveMatchEvents(db, competition.slug, res.transitions).catch(() => {})
      } catch {
        // Skip competitions that error (rate-limited or missing provider token);
        // never let one break the others' live updates.
      }
    }

    await publishMatchUpdates(db, changed)
    return { result: { changed: changed.length } }
    })
  },
})
