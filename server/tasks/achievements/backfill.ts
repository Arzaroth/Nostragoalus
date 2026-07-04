import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { backfillAchievements } from '../../utils/achievements/backfill'

// Manual-only (admin Background tasks page): grant the milestone badges players
// already earned in competitions that were scored before the achievements feature
// shipped (or that have already finished). Milestone badges otherwise only unlock
// on a matches:finalize tick that newly scores a match, so historical data never
// gets them without this. Idempotent and silent - see utils/achievements/backfill.
export default defineTask({
  meta: { name: 'achievements:backfill', description: 'Grant milestone badges earned before the feature shipped' },
  async run() {
    return recordTaskRun(db, 'achievements:backfill', () => backfillAchievements(db))
  },
})
