import { db } from '../../db'
import { finalizeMatches } from '../utils/sync/finalize'

export default defineTask({
  meta: { name: 'matches:finalize', description: 'Lock due predictions and score finished matches' },
  async run() {
    return { result: await finalizeMatches(db) }
  },
})
