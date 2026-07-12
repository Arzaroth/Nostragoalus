import { z } from 'zod'
import { db } from '../../../db'
import { getKtHead } from '../../utils/key-transparency/service'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({ seq: z.number(), hash: z.string(), size: z.number() })

// Public transparency anchor: the current head (size + hash) of the key
// transparency log. Session-less on purpose - anyone can pin it and later detect a
// server that rewrote the log. Cheap; safe to poll.
export default defineReadHandler({ response: responseSchema }, async () => {
  const head = await getKtHead(db)
  return { seq: head.seq, hash: head.hash, size: head.seq + 1 }
})

defineRouteMeta({
  openAPI: {
    tags: ['Keys'],
    summary: 'Key-transparency head',
    description:
      'The current head of the append-only key-transparency log (hash + size). Public anchor: pin it, then verify a later full-log fetch still contains this head.',
    responses: { '200': { description: '{ seq, hash, size }.' } },
  },
})
