import { z } from 'zod'
import { db } from '../../../db'
import { setShowcase } from '../../utils/achievements/cabinet'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { SHOWCASE_SLOT_COUNT } from '#shared/types/achievements'

const bodySchema = z.object({
  competition: z.string().optional(),
  // The ordered achievements to display; array position is the showcase slot.
  // Replaces the existing showcase wholesale. Each must be one the user earned.
  items: z
    .array(
      z.object({
        achievementKey: z.string().min(1).max(64),
      }),
    )
    .max(SHOWCASE_SLOT_COUNT),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await resolveCompetition(db, body.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const showcase = await setShowcase(db, { competitionId: competition.id, userId: user.id, items: body.items })
  return { ok: true, showcase }
})

defineRouteMeta({
  openAPI: {
    tags: ['Achievements'],
    summary: 'Arrange your showcase',
    description:
      "Replace your showcase (the pinned, publicly-shown subset of your achievements) for a competition. Array order is display order; every achievement must be one you've earned.",
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              competition: { type: 'string', description: "Competition slug. Defaults to the current tournament." },
              items: {
                type: 'array',
                maxItems: SHOWCASE_SLOT_COUNT,
                items: {
                  type: 'object',
                  properties: {
                    achievementKey: { type: 'string' },
                  },
                  required: ['achievementKey'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    },
    responses: {
      '200': { description: 'The saved showcase.' },
      '400': { description: 'Too many achievements, a duplicate, or one the user has not earned.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
