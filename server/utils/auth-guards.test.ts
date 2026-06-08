import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy better-auth init and the runtime config the guards read.
const getSession = vi.fn()
vi.mock('../../lib/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }))
let adminEmails = ''
vi.stubGlobal('useRuntimeConfig', () => ({ adminEmails }))
vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string }) =>
  Object.assign(new Error(e.statusMessage), e),
)

const event = { headers: new Headers() } as never

async function guards() {
  return import('./auth-guards')
}

beforeEach(() => {
  getSession.mockReset()
  adminEmails = ''
})
afterEach(() => vi.clearAllMocks())

describe('auth guards', () => {
  it('requireUser returns the user or throws 401', async () => {
    const { requireUser } = await guards()
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } })
    expect(await requireUser(event)).toMatchObject({ id: 'u1' })
    getSession.mockResolvedValue(null)
    await expect(requireUser(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('requireAdmin: role admin OR env-listed email, else 403', async () => {
    const { requireAdmin } = await guards()
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'role@b.c', role: 'admin' } })
    expect(await requireAdmin(event)).toMatchObject({ role: 'admin' })

    adminEmails = 'boss@club.com, other@x.y'
    getSession.mockResolvedValue({ user: { id: 'u2', email: 'BOSS@club.com', role: 'user' } })
    expect(await requireAdmin(event)).toMatchObject({ id: 'u2' }) // case-insensitive env match

    getSession.mockResolvedValue({ user: { id: 'u3', email: 'nobody@x.y', role: 'user' } })
    await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 403 })

    // empty admin-email config: a non-role user is never admin
    adminEmails = ''
    getSession.mockResolvedValue({ user: { id: 'u4', email: 'x@y.z', role: 'user' } })
    await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('isAdmin / getSessionUser reflect the session', async () => {
    const { isAdmin, getSessionUser } = await guards()
    adminEmails = 'a@b.c'
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'user' } })
    expect(await isAdmin(event)).toBe(true)
    getSession.mockResolvedValue(null)
    expect(await isAdmin(event)).toBe(false)
    expect(await getSessionUser(event)).toBeNull()
  })
})
