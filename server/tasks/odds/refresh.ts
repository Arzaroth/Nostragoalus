import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { syncOdds } from '../../utils/odds/sync'

export default defineTask({
  meta: { name: 'odds:refresh', description: 'Snapshot bookmaker odds for upcoming matches' },
  async run({ payload }) {
    return recordTaskRun(db, 'odds:refresh', async () => {
      // String(): nitro coerces NUXT_CRON_ENABLED=true to a boolean via destr.
      if (String(useRuntimeConfig().cronEnabled) !== 'true' && payload?.force !== true) return { result: 'disabled' }
      return { result: await syncOdds(db) }
    })
  },
})
