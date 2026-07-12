import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { backfillOdds } from '../../utils/odds/sync'

// Manual-only (admin button): recovers closing odds for finished matches of
// past tournaments. Capped per run - re-trigger until `remaining` hits 0.
export default defineTask({
  meta: { name: 'odds:backfill', description: 'Backfill closing odds for finished matches' },
  async run() {
    return recordTaskRun(db, 'odds:backfill', async () => {
      return { result: await backfillOdds(db) }
    })
  },
})
