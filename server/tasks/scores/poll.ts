import { db } from '../../../db'
import { providerForCompetition } from '../../utils/providers'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { resolveCompetitionSeason, syncLive } from '../../utils/sync/competition'
import { hasLiveWindow } from '../../utils/sync/live-window'
import { publishMatchUpdates } from '../../utils/live/hub'
import { ProviderRateLimitError } from '../../utils/providers/types'

export default defineTask({
  meta: { name: 'scores:poll', description: 'Poll live scores for active competitions while matches are live' },
  async run() {
    if (useRuntimeConfig().cronEnabled !== 'true') return { result: 'disabled' }
    if (!(await hasLiveWindow(db))) return { result: 'idle' }

    const changed: string[] = []
    try {
      for (const competition of await listActiveCompetitions(db)) {
        const seasonId = await resolveCompetitionSeason(db, competition)
        const provider = providerForCompetition(competition, seasonId)
        const res = await syncLive(db, competition.id, provider)
        changed.push(...res.changedMatchIds)
      }
    } catch (error) {
      if (error instanceof ProviderRateLimitError) return { result: 'rate_limited' }
      throw error
    }

    await publishMatchUpdates(db, changed)
    return { result: { changed: changed.length } }
  },
})
