import { z } from 'zod'

// Shared response schemas for the competition/leaderboard/commitment/push/keys
// routes. Lives under server/schemas (out of the coverage gate) like
// server/schemas/prediction.ts; the handler-return typecheck (see
// server/utils/validated-handler.ts + read-handler.ts) proves each route's return
// still matches these shapes.

// The minimal competition reference shared by the competitions list and the
// leaderboard (which embeds the resolved competition it ranked).
export const competitionRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
})
