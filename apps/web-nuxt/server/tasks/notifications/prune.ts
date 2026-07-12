import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { pruneNotifications } from '../../utils/notifications/service'

export default defineTask({
  meta: {
    name: 'notifications:prune',
    description: 'Retention sweep: drop read notifications past the retention window and cap each user to the newest few hundred',
  },
  async run({ payload }) {
    return recordTaskRun(db, 'notifications:prune', async () => {
      if (cronDisabled(useRuntimeConfig().cronEnabled, payload)) return { result: 'disabled' }
      const { aged, capped } = await pruneNotifications(db)
      return { result: { aged, capped } }
    })
  },
})
