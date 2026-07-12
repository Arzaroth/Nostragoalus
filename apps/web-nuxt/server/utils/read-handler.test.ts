import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ValidationError } from './errors'

const requireUser = vi.fn()
const requireAdmin = vi.fn()
vi.mock('./auth-guards', () => ({
  requireUser: (...a: unknown[]) => requireUser(...a),
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
  requireApiKey: vi.fn(),
}))

let queryByEvent: WeakMap<object, unknown>
beforeEach(() => {
  queryByEvent = new WeakMap()
  requireUser.mockReset()
  requireAdmin.mockReset()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getQuery', (event: object) => queryByEvent.get(event) ?? {})
  vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string; data?: unknown }) =>
    Object.assign(new Error(e.statusMessage), e),
  )
})
afterEach(() => vi.unstubAllGlobals())

async function load() {
  return (await import('./read-handler')).defineReadHandler
}

const response = z.object({ players: z.number().int(), predictions: z.number().int() })

function call(handler: any, query?: unknown) {
  const event = {}
  if (query !== undefined) queryByEvent.set(event, query)
  return handler(event)
}

describe('defineReadHandler', () => {
  it('is public by default: no auth, null user, response passed through', async () => {
    const define = await load()
    const handler = define({ response }, async ({ user }) => {
      expect(user).toBeNull()
      return { players: 3, predictions: 9 }
    })
    expect(await call(handler)).toEqual({ players: 3, predictions: 9 })
    expect(requireUser).not.toHaveBeenCalled()
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  it('enforces user auth and hands the user to the handler', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    const define = await load()
    const handler = define({ response, auth: 'user' }, async ({ user }) => {
      expect(user).toEqual({ id: 'u1', email: 'a@b.c' })
      return { players: 1, predictions: 1 }
    })
    await call(handler)
    expect(requireUser).toHaveBeenCalledOnce()
  })

  it('enforces admin auth', async () => {
    requireAdmin.mockResolvedValue({ id: 'a1', email: 'a@b.c', role: 'admin' })
    const define = await load()
    const handler = define({ response, auth: 'admin' }, async () => ({ players: 0, predictions: 0 }))
    await call(handler)
    expect(requireAdmin).toHaveBeenCalledOnce()
  })

  it('validates the query string and passes the parsed value', async () => {
    const define = await load()
    const query = z.object({ limit: z.coerce.number().int().max(100) })
    const handler = define({ response, query }, async ({ query }) => {
      expect(query).toEqual({ limit: 20 })
      return { players: 0, predictions: 0 }
    })
    await call(handler, { limit: '20' })
  })

  it('rejects a bad query with 422', async () => {
    const define = await load()
    const query = z.object({ limit: z.coerce.number().int().max(100) })
    const handler = define({ response, query }, async () => ({ players: 0, predictions: 0 }))
    await expect(call(handler, { limit: '500' })).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Invalid query' })
  })

  it('500s when the handler return breaks the response contract', async () => {
    const define = await load()
    const handler = define({ response }, async () => ({ players: 'lots', predictions: 9 }) as never)
    await expect(call(handler)).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Response contract violation' })
  })

  it('maps a domain error thrown by the handler to its HTTP status', async () => {
    const define = await load()
    const handler = define({ response }, async () => {
      throw new ValidationError('nope')
    })
    await expect(call(handler)).rejects.toMatchObject({ statusCode: 400 })
  })
})
