import { z } from 'zod'

// Response schemas shared by 2+ of the league chat routes. They mirror the wire
// shapes the handlers return, so the handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches its
// contract. Lives under server/schemas (out of the coverage gate) like chat.ts.

// A message's moderation state, shared by the moderate + report + reports routes.
export const moderationStateSchema = z.enum(['VISIBLE', 'PENDING', 'REMOVED'])

// The bare epoch acknowledgement enable + rotate return after bumping the
// league's chat key epoch.
export const epochResultSchema = z.object({ epoch: z.number() })
