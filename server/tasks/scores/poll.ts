import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { providerForCompetition } from '../../utils/providers'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { resolveCompetitionSeason, syncLive } from '../../utils/sync/competition'
import { hasLiveWindow } from '../../utils/sync/live-window'
import { publishMatchUpdates } from '../../utils/live/hub'
import { notifyLiveMatchEvents } from '../../utils/push/live'

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
