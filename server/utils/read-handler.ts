import type { H3Event } from 'h3'
import type { z, ZodType } from 'zod'
import { requireAdmin, requireUser } from './auth-guards'
import { toHttpError } from './http'
import { type HandlerContract, parseResponse, type ResponseReturn } from './validated-handler'

type ReadUser = { id: string; email: string; role?: string | null }
type Auth = 'user' | 'admin'

interface ReadCtx<Q, A extends Auth | undefined> {
  event: H3Event
  query: Q
  // Non-null when the route opts into auth; null on a public read. The auth
  // literal narrows it so an auth'd handler needs no null check.
  user: A extends Auth ? ReadUser : ReadUser | null
}

interface ReadOptions<R extends ZodType, Q extends ZodType, A extends Auth | undefined> {
  // The response contract - always required, so every read has a machine-
  // readable, runtime-checked shape for the OpenAPI/Dart client to bind to.
  response: R
  // Reads are public by default (a GET carries no CSRF risk); opt into auth.
  auth?: A
  // Optional query-string contract, validated the same way a body is.
  query?: Q
}

// The read counterpart to defineValidatedHandler: enforce optional auth, parse
// the query string against a zod schema, map domain errors to HTTP, and validate
// the response against its contract on the way out. Keeps the read routes as thin
// and as contract-bound as the mutations.
export function defineReadHandler<R extends ZodType, Q extends ZodType = ZodType, A extends Auth | undefined = undefined>(
  options: ReadOptions<R, Q, A>,
  handler: (ctx: ReadCtx<Q extends ZodType ? z.infer<Q> : undefined, A>) => ResponseReturn<R>,
) {
  const handle = defineEventHandler(async (event) => {
    let user: ReadUser | null = null
    if (options.auth === 'admin') user = await requireAdmin(event)
    else if (options.auth === 'user') user = await requireUser(event)

    let query: unknown
    if (options.query) {
      const parsed = options.query.safeParse(getQuery(event))
      if (!parsed.success) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Invalid query',
          data: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        })
      }
      query = parsed.data
    }

    let result: unknown
    try {
      result = await handler({ event, query: query as never, user } as Parameters<typeof handler>[0])
    } catch (error) {
      throw toHttpError(error)
    }
    return parseResponse(options.response, result)
  })
  // See defineValidatedHandler: the spec emitter reads this to build the read's
  // OpenAPI operation from its zod contract.
  ;(handle as HandlerContract).__contract = { kind: 'read', response: options.response }
  return handle
}
