import { ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../db'
import { account } from '../../../../db/schema'
import { defineReadHandler } from '../../../utils/read-handler'

const responseSchema = z.object({ links: z.record(z.string(), z.array(z.string())) })

// Per-user SSO provider links for the admin user list (better-auth's listUsers
// only returns user rows): drives the SSO indicator and the unlink action.
export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  const rows = await db
    .select({ userId: account.userId, providerId: account.providerId })
    .from(account)
    .where(ne(account.providerId, 'credential'))
  const links: Record<string, string[]> = {}
  for (const r of rows) (links[r.userId] ??= []).push(r.providerId)
  return { links }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'SSO links per user',
    description: 'Internal: map of userId to linked SSO provider ids.',
    responses: {
      '200': { description: 'Link map.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
