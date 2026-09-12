import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { cronDisabled } from '../../utils/tasks/cron-gate'
import { pruneUnverifiedUsers } from '../../utils/auth/prune-unverified'

export default defineTask({
  meta: { name: 'users:prune-unverified', description: 'Delete unverified accounts older than 7 days (only while email verification is required)' },
  async run({ payload }) {
    return recordTaskRun(db, 'users:prune-unverified', async () => {
      // Gated like every other scheduled task, and more so: this is the only one
      // that deletes accounts. NUXT_CRON_ENABLED=false is what an operator
      // reaches for to stop jobs during an incident, and it used to stop every
      // job except this one. A manual admin trigger (payload.force) still runs.
      if (cronDisabled(useRuntimeConfig().cronEnabled, payload)) return { result: 'disabled' }
      return { result: await pruneUnverifiedUsers(db) }
    })
  },
})
