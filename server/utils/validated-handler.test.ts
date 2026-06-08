import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ValidationError } from './errors'

// Mock the auth guards: requireUser/requireAdmin resolve to a user or throw.
const requireUser = vi.fn()
const requireAdmin = vi.fn()
vi.mock('./auth-guards', () => ({
  requireUser: (...a: unknown[]) => requireUser(...a),
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
}))

// h3 globals the wrapper relies on (auto-imported in the Nuxt runtime).
let bodyByEvent: WeakMap<object, unknown>
beforeEach(() => {
  bodyByEvent = new WeakMap()
  requireUser.mockReset()
  requireAdmin.mockReset()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', async (event: object) => bodyByEvent.get(event))
  vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string; data?: unknown }) =>
    Object.assign(new Error(e.statusMessage), e),
  )
})
afterEach(() => vi.unstubAllGlobals())

const ADMIN = { id: 'u1', email: 'a@b.c', role: 'admin' }

async function load() {
  return (await import('./validated-handler')).defineValidatedHandler
}

function callWith(handler: any, body: unknown) {
  const event = {}
  bodyByEvent.set(event, body)
  return handler(event)
}

describe('defineValidatedHandler', () => {
  it('requires a user by default and passes the validated body through', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler(
      { body: z.object({ matchId: z.string().uuid(), home: z.number().int().min(0) }) },
      async ({ body, user }) => ({ saved: body.matchId, by: user.id }),
    )
    const res = await callWith(handler, { matchId: '550e8400-e29b-41d4-a716-446655440000', home: 2 })
    expect(res).toEqual({ saved: '550e8400-e29b-41d4-a716-446655440000', by: 'u1' })
    expect(requireUser).toHaveBeenCalledOnce()
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  it('uses the admin guard when admin:true', async () => {
    requireAdmin.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({ admin: true }, async () => ({ ok: true }))
    expect(await callWith(handler, undefined)).toEqual({ ok: true })
    expect(requireAdmin).toHaveBeenCalledOnce()
  })

  it('rejects an invalid body with 422 and issue details, never calling the handler', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const inner = vi.fn()
    const handler = defineValidatedHandler({ body: z.object({ home: z.number().int().min(0) }) }, inner)
    await expect(callWith(handler, { home: -3 })).rejects.toMatchObject({ statusCode: 422 })
    await expect(callWith(handler, { home: 'x' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(callWith(handler, undefined)).rejects.toMatchObject({ statusCode: 422 })
    expect(inner).not.toHaveBeenCalled()
  })

  it('maps domain errors through toHttpError', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({ body: z.object({ x: z.number() }) }, async () => {
      throw new ValidationError('teams not confirmed yet')
    })
    await expect(callWith(handler, { x: 1 })).rejects.toMatchObject({ statusCode: 400, message: 'teams not confirmed yet' })
  })

  it('runs guard-only handlers with no body schema', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({}, async ({ body }) => ({ body: body ?? null }))
    expect(await callWith(handler, { ignored: true })).toEqual({ body: null })
  })
})
