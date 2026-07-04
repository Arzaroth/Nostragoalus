import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { searchRecipients } from '../../utils/dm/service'
import type { DmRecipientDTO } from '../../../shared/types/dm'

// Search for someone to DM: league co-members (always searchable) plus globally
// discoverable users matching the `q` term. An empty term returns co-members only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const q = (getQuery(event).q as string | undefined) ?? ''
  const recipients: DmRecipientDTO[] = await searchRecipients(db, user.id, q)
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
