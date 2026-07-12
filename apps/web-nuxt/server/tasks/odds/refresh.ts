import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { syncOdds } from '../../utils/odds/sync'

export default defineTask({
  meta: { name: 'odds:refresh', description: 'Snapshot bookmaker odds for upcoming matches' },
  async run({ payload }) {
    return recordTaskRun(db, 'odds:refresh', async () => {
      if (cronDisabled(useRuntimeConfig().cronEnabled, payload)) return { result: 'disabled' }
      return { result: await syncOdds(db) }
    })
  },
})
