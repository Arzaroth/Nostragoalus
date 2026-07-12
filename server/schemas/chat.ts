import { z } from 'zod'

// Shared response schemas for the chat routes. Lives under server/schemas (not
// server/utils) so it stays out of the coverage gate; route files are thin and
// uncovered by design.

// The bare acknowledgement several chat mutations return ({ ok: true }). One
// place so the three routes that use it (read, recovery, identity reset) can't
// drift on the literal.
export const okSchema = z.object({ ok: z.literal(true) })
