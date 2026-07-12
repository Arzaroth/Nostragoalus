import { z } from 'zod'

// Shared response shapes for the /api/me, /api/users and /api/showcase routes.
// Lives under server/schemas (not server/utils) so it stays out of the coverage
// gate - route files are thin and uncovered by design. Only shapes used by 2+ of
// those routes belong here; a single-route shape stays a const in its route file.

// One pinned showcase slot (#shared/types/achievements ShowcasePinDto). Returned
// both inside a cabinet (users/[id]/cabinet.get) and on its own after a save
// (showcase/index.put), so it is shared.
export const showcasePinSchema = z.object({
  slot: z.number(),
  achievementKey: z.string(),
})
