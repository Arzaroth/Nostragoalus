import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { listCompetitionsForAdmin, setCompetitionFeaturedTeam } from '../../../utils/competitions/admin'
import { NotFoundError } from '../../../utils/errors'

const bodySchema = z.object({
  competition: z.string(),
  // A team code sets the featured team, null clears it (disabling TEAM_SPECIALIST).
  featuredTeamCode: z.string().max(8).nullable(),
})

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ body }) => {
  const competition = await getCompetitionBySlug(db, body.competition)
  if (!competition) throw new NotFoundError('competition not found')
  await setCompetitionFeaturedTeam(db, competition.id, body.featuredTeamCode)
  return { ok: true, competitions: await listCompetitionsForAdmin(db) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: "Set a competition's featured team",
    description: 'Admin only. Choose the team the TEAM_SPECIALIST prize tracks (or null to disable it). The code must be one of the competition fixtures teams.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              competition: { type: 'string', description: 'Competition slug.' },
              featuredTeamCode: { type: 'string', nullable: true, description: 'FIFA tricode, or null to clear.' },
            },
            required: ['competition', 'featuredTeamCode'],
          },
        },
      },
    },
    responses: {
      '200': { description: 'Updated competitions.' },
      '401': { description: 'Not an admin.' },
      '404': { description: 'Unknown competition or team.' },
      '422': { description: 'Invalid payload.' },
    },
  },
})
