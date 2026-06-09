import { and, eq, ne } from 'drizzle-orm'
import { db } from '../../../../../db'
import { account } from '../../../../../db/schema'
import { requireAdmin } from '../../../../utils/auth-guards'

// Detaches a user from SSO by removing every non-credential account link. With
// no password either, the user recovers through the forgot-password flow
// (better-auth recreates the credential account on reset).
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') as string
  const removed = await db
    .delete(account)
    .where(and(eq(account.userId, id), ne(account.providerId, 'credential')))
    .returning({ id: account.id })
  return { ok: true, removed: removed.length }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Unlink a user from SSO',
    description: 'Internal: removes all SSO account links. Without a password the user can recover one through the reset flow.',
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
      '200': { description: 'Links removed (count returned).' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
