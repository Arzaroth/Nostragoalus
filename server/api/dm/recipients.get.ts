import { z } from 'zod'
import { db } from '../../../db'
import { searchRecipients } from '../../utils/dm/service'
import { defineReadHandler } from '../../utils/read-handler'
import type { DmRecipientDTO } from '../../../shared/types/dm'

const querySchema = z.object({ q: z.string().optional() })
const recipientSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  shared: z.boolean(),
})
const responseSchema = z.object({ recipients: z.array(recipientSchema) })

// Search for someone to DM: league co-members (always searchable) plus globally
// discoverable users matching the `q` term. An empty term returns co-members only.
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const recipients: DmRecipientDTO[] = await searchRecipients(db, user.id, query.q ?? '')
  return { recipients }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Search DM recipients',
    description: 'Co-members (always) plus globally discoverable users matching q. Only users with a chat identity are returned.',
    parameters: [{ in: 'query', name: 'q', required: false, schema: { type: 'string' } }],
    responses: { '200': { description: '{ recipients: DmRecipientDTO[] }.' }, '401': { description: 'Not signed in.' } },
  },
})
