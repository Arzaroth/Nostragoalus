import type { H3Event } from 'h3'
import type { z, ZodType } from 'zod'
import { requireAdmin, requireApiKey, requireUser } from './auth-guards'
import { assertSameOrigin } from './csrf'
import { toHttpError } from './http'

interface HandlerCtx<B> {
  event: H3Event
  body: B
  user: { id: string; email: string; role?: string | null }
}

interface Options<S extends ZodType> {
  body?: S
  admin?: boolean
  // When set, the route ALSO accepts an x-api-key carrying these permissions
  // (e.g. { media: ['write'] }); for admin routes the key's owner must be an
  // admin too. Routes without this option are session-only and reject keys.
  apiKey?: Record<string, string[]>
  // The response contract. When set, the handler's return is parsed through it
  // before it leaves the server, so a shape that drifts from the published
  // OpenAPI/Dart contract is a loud 500 here, not a silent client break. Same
  // schema the spec emitter reads (server/utils/openapi/contract.ts).
  response?: ZodType
}

// One wrapper for mutating routes: enforce auth (user or admin), parse+validate
// the body against a Zod schema (so the OpenAPI constraints are load-bearing),
// and map domain errors to HTTP. Replaces the String()/Number() coercion that
// let NaN/"undefined" flow into services.
export function defineValidatedHandler<S extends ZodType>(
  options: Options<S>,
  handler: (ctx: HandlerCtx<S extends ZodType ? z.infer<S> : undefined>) => unknown | Promise<unknown>,
) {
  const handle = defineEventHandler(async (event) => {
    const apiKeyHeader = event.headers?.get?.('x-api-key')
    let user: HandlerCtx<unknown>['user']
    if (apiKeyHeader) {
      // A key is presented: only honour it where the route opted in, otherwise
      // it's a session-only route and the key is rejected.
      if (!options.apiKey) throw createError({ statusCode: 401, statusMessage: 'API key not accepted on this route' })
      user = await requireApiKey(apiKeyHeader, options.apiKey, !!options.admin)
    } else {
      // Cookie-session auth is the CSRF-exposed path; reject a cross-origin
      // mutation before touching the session. API-key callers (above) skip this.
      assertSameOrigin(event)
      user = options.admin ? await requireAdmin(event) : await requireUser(event)
    }

    let body: unknown
    if (options.body) {
      const raw = await readBody(event).catch(() => undefined)
      const parsed = options.body.safeParse(raw)
      if (!parsed.success) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Invalid request body',
          data: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        })
      }
      body = parsed.data
    }

    let result: unknown
    try {
      result = await handler({ event, body: body as never, user })
    } catch (error) {
      throw toHttpError(error)
    }
    return options.response ? parseResponse(options.response, result) : result
  })
  // The spec emitter reads this off the default export (under a stubbed import)
  // to build the route's OpenAPI operation from the SAME zod schemas the handler
  // validates with. Inert at runtime.
  ;(handle as HandlerContract).__contract = { kind: 'mutation', body: options.body, response: options.response }
  return handle
}

export interface HandlerContract {
  __contract?: {
    kind: 'mutation' | 'read'
    body?: ZodType
    response?: ZodType
  }
}

// A handler return that fails its own response contract is a server bug, not a
// client one: surface it as a 500 with the offending paths (never a malformed
// 200 the client has to guess at).
export function parseResponse<R>(schema: ZodType, result: unknown): R {
  const parsed = schema.safeParse(result)
  if (!parsed.success) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Response contract violation',
      data: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data as R
}
