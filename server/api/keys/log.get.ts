import { db } from '../../../db'
import { getKtLog } from '../../utils/key-transparency/service'

// Public, session-less full key-transparency log: every hash-chained
// (userId -> publicKey) binding, in order, plus the head. A client recomputes the
// chain, checks it against a pinned head, and confirms each member's key is the one
// recorded here - so a substituted key is either visible in this public log or
// missing from it (both detectable). Only public keys and user ids, never secrets.
export default defineEventHandler(async () => {
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
