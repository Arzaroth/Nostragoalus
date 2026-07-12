import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildOperation, toOpenApiSchema } from './contract'

describe('toOpenApiSchema', () => {
  it('emits the OpenAPI 3.0 dialect with no $schema key', () => {
    const out = toOpenApiSchema(z.object({ id: z.string().uuid() }))
    expect(out.$schema).toBeUndefined()
    expect(out).toMatchObject({ type: 'object', properties: { id: { type: 'string', format: 'uuid' } } })
  })

  it('uses `nullable` (3.0), not an anyOf-null union', () => {
    const out = toOpenApiSchema(z.object({ a: z.string().nullable() }))
    expect((out.properties as Record<string, unknown>).a).toMatchObject({ nullable: true, type: 'string' })
  })

  it('maps z.date() to a date-time string (the wire shape)', () => {
    const out = toOpenApiSchema(z.object({ createdAt: z.date() }))
    expect((out.properties as Record<string, unknown>).createdAt).toEqual({ type: 'string', format: 'date-time' })
  })

  it('honours the input vs output projection', () => {
    // A default is optional on the way in, always present on the way out.
    const schema = z.object({ n: z.number().default(1) })
    const input = toOpenApiSchema(schema, 'input')
    const output = toOpenApiSchema(schema, 'output')
    expect(input.required).toBeUndefined()
    expect(output.required).toEqual(['n'])
  })
})

describe('buildOperation', () => {
  const response = z.object({ ok: z.literal(true) })

  it('builds a full mutation operation from body + response + prose', () => {
    const op = buildOperation({
      body: z.object({ matchId: z.string().uuid(), isJoker: z.boolean() }),
      response,
      meta: { tags: ['Predictions'], summary: 'Move the joker', description: 'Set or clear.' },
    })
    expect(op.tags).toEqual(['Predictions'])
    expect(op.summary).toBe('Move the joker')
    expect(op.description).toBe('Set or clear.')
    expect(op.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { type: 'object', required: ['matchId', 'isJoker'] } } },
    })
    expect((op.responses as Record<string, unknown>)['200']).toMatchObject({
      description: 'Success.',
      content: { 'application/json': { schema: { type: 'object' } } },
    })
  })

  it('omits requestBody for a read (no body schema)', () => {
    const op = buildOperation({ response, meta: { tags: ['Stats'] } })
    expect(op.requestBody).toBeUndefined()
    expect((op.responses as Record<string, unknown>)['200']).toBeDefined()
  })

  it('defaults the 200 description and works with no meta at all', () => {
    const op = buildOperation({ response })
    expect(op.tags).toBeUndefined()
    expect((op.responses as Record<string, Record<string, unknown>>)['200'].description).toBe('Success.')
  })

  it('merges extra error responses and lets meta override the 200 prose', () => {
    const op = buildOperation({
      body: z.object({ x: z.number() }),
      response,
      meta: {
        responses: {
          '200': { description: 'Updated joker placement.' },
          '401': { description: 'Not signed in.' },
          '409': { description: 'A match already started.' },
        },
      },
    })
    const responses = op.responses as Record<string, Record<string, unknown>>
    expect(responses['200'].description).toBe('Updated joker placement.')
    expect(responses['200'].content).toBeDefined() // schema still present, only prose overridden
    expect(responses['401']).toEqual({ description: 'Not signed in.' })
    expect(responses['409']).toEqual({ description: 'A match already started.' })
  })
})
