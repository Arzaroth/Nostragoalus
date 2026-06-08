import type { H3Event } from 'h3'
import type { z, ZodType } from 'zod'
import { requireAdmin, requireUser } from './auth-guards'
import { toHttpError } from './http'

interface HandlerCtx<B> {
  event: H3Event
  body: B
  user: { id: string; email: string; role?: string | null }
}

interface Options<S extends ZodType> {
  body?: S
  admin?: boolean
}

// One wrapper for mutating routes: enforce auth (user or admin), parse+validate
// the body against a Zod schema (so the OpenAPI constraints are load-bearing),
// and map domain errors to HTTP. Replaces the String()/Number() coercion that
// let NaN/"undefined" flow into services.
export function defineValidatedHandler<S extends ZodType>(
  options: Options<S>,
  handler: (ctx: HandlerCtx<S extends ZodType ? z.infer<S> : undefined>) => unknown | Promise<unknown>,
) {
  return defineEventHandler(async (event) => {
    const user = options.admin ? await requireAdmin(event) : await requireUser(event)

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

    try {
      return await handler({ event, body: body as never, user })
    } catch (error) {
      throw toHttpError(error)
    }
  })
}
