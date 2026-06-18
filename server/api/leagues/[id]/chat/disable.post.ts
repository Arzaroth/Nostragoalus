import { db } from '../../../../../db'
import { disableLeagueChat } from '../../../../utils/chat/service'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

// Turn chat off (OWNER/MODERATOR). History and keys are kept so it can be turned
// back on without a re-key.
export default defineValidatedHandler({}, async ({ user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  await disableLeagueChat(db, { leagueId, actorId: user.id })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Disable league chat',
    description: 'OWNER/MODERATOR only. Flips chat off; keeps history and keys.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ ok: true }.' }, '403': { description: 'Not an admin.' } },
  },
})
