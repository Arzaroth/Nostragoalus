import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy better-auth init and the runtime config the guards read.
const getSession = vi.fn()
const verifyApiKey = vi.fn()
const dbLimit = vi.fn()
vi.mock('../../lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a), verifyApiKey: (...a: unknown[]) => verifyApiKey(...a) } },
}))
// db.select(...).from(...).where(...).limit() resolves to the owner-lookup rows.
vi.mock('../../db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: (...a: unknown[]) => dbLimit(...a) }) }) }) },
}))
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
  verifyApiKey.mockReset()
  dbLimit.mockReset()
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

  it('getSessionUser strips x-api-key so a key never resolves a session', async () => {
    const { getSessionUser } = await guards()
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } })
    await getSessionUser({ headers: new Headers({ 'x-api-key': 'k', cookie: 'c' }) } as never)
    const passed = (getSession.mock.calls.at(-1)![0] as { headers: Headers }).headers
    expect(passed.get('x-api-key')).toBeNull()
    expect(passed.get('cookie')).toBe('c')
  })
})

describe('requireUserOrApiKey', () => {
  it('falls back to the session when no api key is presented (401 if anonymous)', async () => {
    const { requireUserOrApiKey } = await guards()
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } })
    expect(await requireUserOrApiKey(event, { leaderboard: ['read'] })).toMatchObject({ id: 'u1' })
    getSession.mockResolvedValue(null)
    await expect(requireUserOrApiKey(event, { leaderboard: ['read'] })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('honours a scoped key (non-admin owner allowed) when the header is present', async () => {
    const { requireUserOrApiKey } = await guards()
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'u2' } })
    dbLimit.mockResolvedValue([{ id: 'u2', email: 'bot@x.y', role: 'user' }])
    const keyEvent = { headers: new Headers({ 'x-api-key': 'k' }) } as never
    expect(await requireUserOrApiKey(keyEvent, { leaderboard: ['read'] })).toMatchObject({ id: 'u2' })
    expect(verifyApiKey).toHaveBeenCalledWith({ body: { key: 'k', permissions: { leaderboard: ['read'] } } })
  })
})

describe('requireApiKey', () => {
  it('returns the owner for a valid key with the required permission', async () => {
    const { requireApiKey } = await guards()
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'u1' } })
    dbLimit.mockResolvedValue([{ id: 'u1', email: 'a@b.c', role: 'admin' }])
    expect(await requireApiKey('k', { media: ['write'] },true)).toMatchObject({ id: 'u1' })
    expect(verifyApiKey).toHaveBeenCalledWith({ body: { key: 'k', permissions: { media: ['write'] } } })
  })

  it('401s when the key is invalid or the owner is gone', async () => {
    const { requireApiKey } = await guards()
    verifyApiKey.mockResolvedValue({ valid: false, key: null })
    await expect(requireApiKey('k', { media: ['write'] },false)).rejects.toMatchObject({ statusCode: 401 })

    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'ghost' } })
    dbLimit.mockResolvedValue([])
    await expect(requireApiKey('k', { media: ['write'] },false)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('403s on an admin route when the key owner is not an admin', async () => {
    const { requireApiKey } = await guards()
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'u2' } })
    dbLimit.mockResolvedValue([{ id: 'u2', email: 'user@x.y', role: 'user' }])
    await expect(requireApiKey('k', { media: ['write'] },true)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a non-admin owner on a non-admin route, and an env-admin on an admin route', async () => {
    const { requireApiKey } = await guards()
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'u2' } })
    dbLimit.mockResolvedValue([{ id: 'u2', email: 'user@x.y', role: 'user' }])
    expect(await requireApiKey('k', { media: ['write'] },false)).toMatchObject({ id: 'u2' })

    adminEmails = 'boss@club.com'
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: 'u3' } })
    dbLimit.mockResolvedValue([{ id: 'u3', email: 'BOSS@club.com', role: 'user' }])
    expect(await requireApiKey('k', { media: ['write'] },true)).toMatchObject({ id: 'u3' })
  })
})
