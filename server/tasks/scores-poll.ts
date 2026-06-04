import { db } from '../../db'
import { getProvider } from '../utils/providers'
import { hasLiveWindow } from '../utils/sync/live-window'
import { upsertMatches } from '../utils/sync/upsert-matches'
import { ProviderRateLimitError } from '../utils/providers/types'

export default defineTask({
  meta: { name: 'scores:poll', description: 'Poll live scores while matches are in a live window' },
  async run() {
    if (useRuntimeConfig().cronEnabled !== 'true') return { result: 'disabled' }
    if (!(await hasLiveWindow(db))) return { result: 'idle' }

    try {
      const live = await getProvider().getLiveMatches()
      return { result: await upsertMatches(db, live) }
    } catch (error) {
      if (error instanceof ProviderRateLimitError) return { result: 'rate_limited' }
      throw error
    }
  },
})
