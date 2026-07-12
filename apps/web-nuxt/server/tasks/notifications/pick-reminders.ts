import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { pruneStartedReminders, remindMissingPredictions } from '../../utils/notifications/reminders'

export default defineTask({
  meta: {
    name: 'notifications:pick-reminders',
    description: 'Remind active predictors of matches locking soon they have not picked, and prune reminders for matches that have kicked off',
  },
  async run({ payload }) {
    return recordTaskRun(db, 'notifications:pick-reminders', async () => {
      if (cronDisabled(useRuntimeConfig().cronEnabled, payload)) return { result: 'disabled' }
      // Prune first, so a match that just kicked off drops its now-dead reminders
      // before we scan the window for new ones.
      const pruned = await pruneStartedReminders(db)
      const reminded = await remindMissingPredictions(db)
      return { result: { pruned, reminded } }
    })
  },
})
