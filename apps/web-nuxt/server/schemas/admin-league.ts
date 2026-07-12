import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { roadmapItem } from '../../db/schema'

// Response shapes shared by 2+ of the admin league + roadmap routes in the
// contract-parity pass. Lives under server/schemas (out of the coverage gate) so
// the thin route files stay uncovered by design; the handler-return typecheck
// (see server/utils/validated-handler.ts) proves each route still matches its
// schema.

// Competition reference embedded in the admin league views (list + detail).
export const adminCompetitionRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
})

// A full roadmap_item row as returned by createRoadmapItem/updateRoadmapItem
// (.returning()). Shared by the admin create, update and list routes.
export const adminRoadmapItemSchema = createSelectSchema(roadmapItem)
