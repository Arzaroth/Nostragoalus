import { db } from '../../../../../db'
import { requestChatRekey } from '../../../../utils/chat/service'
import { publishRekeyRequest } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

// A member stuck without the current group key nudges the league's keyholders to
// re-seal it. No body: the server checks the caller really is a keyless member
// and, if so, broadcasts a keyless rekey prompt to the league's connected members
// (only a keyholder client can act on it). This covers every join path uniformly
// - public, code, invite, SSO auto-join, admin add - without a per-path hook.
export default defineValidatedHandler({}, async ({ user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await requestChatRekey(db, leagueId, user.id)
  if (res.requested) void publishRekeyRequest(db, leagueId).catch(() => {})
  return res
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Request the group key',
    description: 'A member missing the current key asks connected keyholders to re-seal it. Members only.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ requested, epoch }.' },
      '403': { description: 'Not signed in.' },
      '404': { description: 'Not a member / unknown league.' },
    },
  },
})
