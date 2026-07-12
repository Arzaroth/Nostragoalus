import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../../db'
import { user } from '../../../../../db/schema'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const responseSchema = z.object({ ok: z.literal(true), hidden: z.boolean() })

// hiddenFromLeaderboard is deliberately NOT a better-auth additionalField, so
// users cannot flip it on themselves through updateUser - only this admin route.
export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  const body = await readBody(event)
  const hidden = body?.hidden === true
  const updated = await db.update(user).set({ hiddenFromLeaderboard: hidden }).where(eq(user.id, id)).returning({ id: user.id })
  if (!updated[0]) throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  return { ok: true as const, hidden }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Hide or show a user on the leaderboard',
    description: 'Internal: hidden users keep playing (their predictions still count in crowd totals) but never appear in rankings.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        description: 'User id.',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'Updated.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown user.' },
    },
  },
})
