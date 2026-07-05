import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ValidationError } from './errors'

// Mock the auth guards: requireUser/requireAdmin/requireApiKey resolve or throw.
const requireUser = vi.fn()
const requireAdmin = vi.fn()
const requireApiKey = vi.fn()
vi.mock('./auth-guards', () => ({
  requireUser: (...a: unknown[]) => requireUser(...a),
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
  requireApiKey: (...a: unknown[]) => requireApiKey(...a),
}))

// h3 globals the wrapper relies on (auto-imported in the Nuxt runtime).
let bodyByEvent: WeakMap<object, unknown>
beforeEach(() => {
  bodyByEvent = new WeakMap()
  requireUser.mockReset()
  requireAdmin.mockReset()
  requireApiKey.mockReset()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', async (event: object) => bodyByEvent.get(event))
  vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string; data?: unknown }) =>
    Object.assign(new Error(e.statusMessage), e),
  )
  vi.stubGlobal('getRequestHost', () => 'app.host')
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

function callWithKey(handler: any, body: unknown, key: string) {
  const event = { headers: new Headers({ 'x-api-key': key }) }
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

  it('accepts an api key when the route opts in, passing the required permissions', async () => {
    requireApiKey.mockResolvedValue({ id: 'bot', email: 'bot@svc', role: 'admin' })
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler(
      { admin: true, apiKey: { media: ['write'] } },
      async ({ user }) => ({ by: user.id }),
    )
    const res = await callWithKey(handler, undefined, 'secret-key')
    expect(res).toEqual({ by: 'bot' })
    const call = requireApiKey.mock.calls[0]
    expect(call[0]).toBe('secret-key')
    expect(call[1]).toEqual({ media: ['write'] })
    expect(call[2]).toBe(true) // mustBeAdmin from admin:true
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(requireUser).not.toHaveBeenCalled()
  })

  it('rejects an api key on a session-only route (no apiKey option)', async () => {
    const defineValidatedHandler = await load()
    const inner = vi.fn()
    const handler = defineValidatedHandler({ admin: true }, inner)
    await expect(callWithKey(handler, undefined, 'secret-key')).rejects.toMatchObject({ statusCode: 401 })
    expect(inner).not.toHaveBeenCalled()
    expect(requireApiKey).not.toHaveBeenCalled()
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  it('falls back to the session guard when no api key header is present', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({ apiKey: { media: ['write'] } }, async ({ user }) => ({ by: user.id }))
    expect(await callWith(handler, undefined)).toEqual({ by: 'u1' })
    expect(requireUser).toHaveBeenCalledOnce()
    expect(requireApiKey).not.toHaveBeenCalled()
  })

  it('runs guard-only handlers with no body schema', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({}, async ({ body }) => ({ body: body ?? null }))
    expect(await callWith(handler, { ignored: true })).toEqual({ body: null })
  })

  it('rejects a cross-origin cookie-session mutation before touching the session', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({}, async () => ({ ok: true }))
    const event = { method: 'POST', headers: new Headers({ origin: 'https://evil.example' }) }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(requireUser).not.toHaveBeenCalled()
  })

  it('allows a same-origin mutation (matching Origin host)', async () => {
    requireUser.mockResolvedValue(ADMIN)
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({}, async ({ user }) => ({ by: user.id }))
    const event = { method: 'POST', headers: new Headers({ origin: 'https://app.host' }) }
    expect(await handler(event)).toEqual({ by: 'u1' })
    expect(requireUser).toHaveBeenCalledOnce()
  })

  it('skips the origin check for api-key callers', async () => {
    requireApiKey.mockResolvedValue({ id: 'k1', email: 'k@b.c', role: 'user' })
    const defineValidatedHandler = await load()
    const handler = defineValidatedHandler({ apiKey: { media: ['write'] } }, async ({ user }) => ({ by: user.id }))
    // Cross-origin header present, but an api-key request is not cookie-borne.
    const event = { method: 'POST', headers: new Headers({ 'x-api-key': 'k', origin: 'https://evil.example' }) }
    bodyByEvent.set(event, undefined)
    expect(await handler(event)).toEqual({ by: 'k1' })
  })
})
