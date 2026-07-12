import { z } from 'zod'

// Shared response schemas for the admin SSO routes (server/api/admin/sso/*).
// Kept under server/schemas so they stay out of the coverage gate and can be
// reused across the sibling routes. The handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches its schema.

// The bare success ack shared by several SSO mutations. z.literal(true) forces
// the route to return `ok: true as const` rather than a widened boolean.
export const okSchema = z.object({ ok: z.literal(true) })
