import { z } from 'zod'

// Shared body for the read + delete routes: a bounded id list, or `all: true` to
// target every (unread, for read) notification. Kept in one place so the cap and
// the "ids or all" rule can't drift between the two endpoints. The leading `_`
// keeps Nitro from treating this as a route.
export const idsOrAllSchema = z
  .object({
    ids: z.array(z.string()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => b.all === true || (b.ids !== undefined && b.ids.length > 0), {
    message: 'Provide a non-empty ids array or all:true',
  })
