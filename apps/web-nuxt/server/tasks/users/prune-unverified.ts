import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { pruneUnverifiedUsers } from '../../utils/auth/prune-unverified'

export default defineTask({
  meta: { name: 'users:prune-unverified', description: 'Delete unverified accounts older than 7 days (only while email verification is required)' },
  async run() {
    return recordTaskRun(db, 'users:prune-unverified', async () => {
      return { result: await pruneUnverifiedUsers(db) }
    })
  },
})
