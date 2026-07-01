import { z } from 'zod'
import { db } from '../../../db'
import { setFridge } from '../../utils/achievements/cabinet'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { FRIDGE_SLOT_COUNT } from '#shared/types/achievements'

const bodySchema = z.object({
  competition: z.string().optional(),
  // The ordered items to display; array position is the fridge slot. Replaces the
  // existing fridge wholesale. Each must be a trophy/achievement the user earned.
  items: z
    .array(
      z.object({
        itemType: z.enum(['TROPHY', 'ACHIEVEMENT']),
        itemKey: z.string().min(1).max(64),
      }),
    )
    .max(FRIDGE_SLOT_COUNT),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await resolveCompetition(db, body.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  const fridge = await setFridge(db, { competitionId: competition.id, userId: user.id, items: body.items })
  return { ok: true, fridge }
})

defineRouteMeta({
  openAPI: {
    tags: ['Achievements'],
    summary: 'Arrange your fridge',
    description:
      "Replace your fridge (the pinned, publicly-shown subset of your trophies and achievements) for a competition. Array order is display order; every item must be one you've earned.",
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
                maxItems: FRIDGE_SLOT_COUNT,
                items: {
                  type: 'object',
                  properties: {
                    itemType: { type: 'string', enum: ['TROPHY', 'ACHIEVEMENT'] },
                    itemKey: { type: 'string' },
                  },
                  required: ['itemType', 'itemKey'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    },
    responses: {
      '200': { description: 'The saved fridge.' },
      '400': { description: 'Too many items, a duplicate, or an item the user has not earned.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
