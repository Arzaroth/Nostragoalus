import { z } from 'zod'
import { db } from '../../../db'
import { defineReadHandler } from '../../utils/read-handler'
import { listCallLog, resolveVoiceScope } from '../../utils/voice/service'
import { ValidationError } from '../../utils/errors'
import type { VoiceScope } from '../../../shared/types/voice'

const querySchema = z.object({
  dmThreadId: z.string().max(64).optional(),
  leagueId: z.string().max(64).optional(),
  matchId: z.string().max(64).optional(),
})

const responseSchema = z.object({
  calls: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['ONGOING', 'ENDED', 'MISSED']),
      initiatorId: z.string().nullable(),
      initiatorName: z.string().nullable(),
      participantCount: z.number(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
    }),
  ),
})

// The recent call log of one chat scope (a DM thread, or a league/match room),
// oldest first - the chat interleaves these as "call started/ended/missed" lines.
// Authorization mirrors joining the call itself (resolveVoiceScope).
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const scope: VoiceScope | null = query.dmThreadId
    ? { kind: 'dm', threadId: query.dmThreadId }
    : query.leagueId
      ? { kind: 'league', leagueId: query.leagueId, matchId: query.matchId ?? null }
      : null
  if (!scope) throw new ValidationError('a dmThreadId or leagueId is required')
  await resolveVoiceScope(db, user.id, scope)
  const calls = await listCallLog(db, scope)
  return {
    calls: calls.map((c) => ({
      id: c.id,
      status: c.status,
      initiatorId: c.initiatorId,
      initiatorName: c.initiatorName,
      participantCount: c.participantCount,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() ?? null,
    })),
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Voice'],
    summary: 'Call log for a chat scope',
    description:
      'Recent voice calls (ongoing, ended, missed) of a DM thread or league/match room, oldest first, for the chat call lines. Caller must be a thread participant / league member.',
    parameters: [
      { in: 'query', name: 'dmThreadId', required: false, schema: { type: 'string', maxLength: 64 } },
      { in: 'query', name: 'leagueId', required: false, schema: { type: 'string', maxLength: 64 } },
      { in: 'query', name: 'matchId', required: false, schema: { type: 'string', maxLength: 64 } },
    ],
    responses: {
      '200': { description: '{ calls: [...] }.' },
      '400': { description: 'Neither scope given.' },
      '404': { description: 'Not a participant / member.' },
    },
  },
})
