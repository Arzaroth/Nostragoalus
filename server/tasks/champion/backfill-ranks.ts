import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { backfillChampionRanks } from '../../utils/champion/backfill'
import { fifaRankingProvider } from '../../utils/providers/fifa-ranking'

// Manual-only (admin Background tasks page): repair champion picks that saved
// with a null FIFA rank + flat points because the ranking fetch was blocked
// during the pick window. Re-resolves the pick-window ranking (live, snapshot
// fallback) and recomputes each pick's rank tier.
export default defineTask({
  meta: { name: 'champion:backfill-ranks', description: 'Backfill champion picks left without a FIFA rank' },
  async run() {
    return recordTaskRun(db, 'champion:backfill-ranks', () => backfillChampionRanks(db, fifaRankingProvider()))
  },
})
