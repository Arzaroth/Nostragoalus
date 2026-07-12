import type { ZodType } from 'zod'
import { z } from 'zod'

// Single source of the request/response contract: the SAME zod schema a route
// validates with is what the OpenAPI doc (and, downstream, a generated Dart
// client) is built from, so the published contract can never drift from what the
// server actually accepts and returns. `openapi-3.0` is Nitro's dialect: it
// emits `nullable: true` and drops the `$schema` key, so no post-processing.
//
// Date policy: a response schema uses `z.date()` for a timestamp - it validates
// the Date object the handler returns, cheaply, in every env (no double
// serialize). h3 then serializes it to an ISO string, so the WIRE shape is a
// date-time string; this maps `z.date()` to exactly that for the published
// contract, keeping the runtime check and the client contract in agreement.
export function toOpenApiSchema(schema: ZodType, io: 'input' | 'output' = 'output'): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    override: (ctx) => {
      if ((ctx.zodSchema as { _zod: { def: { type: string } } })._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string'
        ctx.jsonSchema.format = 'date-time'
      }
    },
  }) as Record<string, unknown>
}

export interface ContractMeta {
  tags?: string[]
  summary?: string
  description?: string
  // Extra (usually error) responses keyed by status code. 200 is derived from
  // the response schema; anything here is merged in, and a `200` entry only
  // overrides that response's prose description.
  responses?: Record<string, { description: string }>
}

export interface RouteContract {
  body?: ZodType
  response: ZodType
  meta?: ContractMeta
}

// Assemble one OpenAPI operation object from a route's zod contract + prose.
// Used by the spec emitter and locked by the contract test; keeping it pure
// (no filesystem, no route awareness) makes both trivial to exercise.
export function buildOperation(contract: RouteContract): Record<string, unknown> {
  const { body, response, meta } = contract
  const op: Record<string, unknown> = {}
  if (meta?.tags) op.tags = meta.tags
  if (meta?.summary) op.summary = meta.summary
  if (meta?.description) op.description = meta.description

  if (body) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: toOpenApiSchema(body, 'input') } },
    }
  }

  const responses: Record<string, unknown> = {
    '200': {
      description: meta?.responses?.['200']?.description ?? 'Success.',
      content: { 'application/json': { schema: toOpenApiSchema(response, 'output') } },
    },
  }
  for (const [code, r] of Object.entries(meta?.responses ?? {})) {
    if (code !== '200') responses[code] = r
  }
  op.responses = responses
  return op
}
