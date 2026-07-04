import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { listCompetitionsForAdmin } from '../../../utils/competitions/admin'

export default defineValidatedHandler({ admin: true }, async () => {
  return { competitions: await listCompetitionsForAdmin(db) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'Competitions and their featured-team options',
    description: 'Admin only. Each competition, its current TEAM_SPECIALIST featured team, and the team codes selectable from its fixtures.',
    responses: {
      '200': { description: 'Competitions with team options.' },
      '401': { description: 'Not an admin.' },
    },
  },
})
