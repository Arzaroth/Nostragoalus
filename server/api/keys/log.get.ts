import { z } from 'zod'
import { db } from '../../../db'
import { getKtLog } from '../../utils/key-transparency/service'
import { defineReadHandler } from '../../utils/read-handler'

// One log entry (KtEntry in shared/key-transparency.ts): a hash-chained
// (userId -> publicKey) binding.
const ktEntrySchema = z.object({
  seq: z.number(),
  prevHash: z.string(),
  userId: z.string(),
  publicKey: z.string(),
  createdAt: z.string(),
  entryHash: z.string(),
})
const responseSchema = z.object({
  entries: z.array(ktEntrySchema),
  head: z.object({ seq: z.number(), hash: z.string() }),
})

// Public, session-less full key-transparency log: every hash-chained
// (userId -> publicKey) binding, in order, plus the head. A client recomputes the
// chain, checks it against a pinned head, and confirms each member's key is the one
// recorded here - so a substituted key is either visible in this public log or
// missing from it (both detectable). Only public keys and user ids, never secrets.
export default defineReadHandler({ response: responseSchema }, async () => {
  return getKtLog(db)
})

defineRouteMeta({
  openAPI: {
    tags: ['Keys'],
    summary: 'Key-transparency log',
    description:
      'The full append-only key-transparency log (ordered chat public-key bindings + head). Public: used to detect a server that substitutes a member key to MITM E2EE chat.',
    responses: { '200': { description: '{ entries: [...], head: { seq, hash } }.' } },
  },
})
