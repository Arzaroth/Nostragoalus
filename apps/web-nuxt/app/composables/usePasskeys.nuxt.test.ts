import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { usePasskeys } from './usePasskeys'

const pk = vi.hoisted(() => ({
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}))
vi.mock('../../lib/auth-client', () => ({
  authClient: { passkey: pk, useSession: () => ref({ data: null }) },
}))

async function setup() {
  let api!: ReturnType<typeof usePasskeys>
  await mountSuspended({
    setup() {
      api = usePasskeys()
      return () => null
    },
  })
  return api
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  Object.values(pk).forEach((f) => f.mockReset())
  fetchMock = vi.fn()
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('usePasskeys', () => {
  it('add: sudo-gates on credentials before registering, then reloads the list', async () => {
    fetchMock.mockResolvedValue({ valid: true })
    pk.addPasskey.mockResolvedValue({ data: {} })
    pk.listUserPasskeys.mockResolvedValue({ data: [{ id: '1', name: 'Key', createdAt: null, deviceType: 'platform' }] })
    const m = await setup()
    m.password.value = 'pw'
    m.code.value = '123456'
    await m.add()
    expect(fetchMock).toHaveBeenCalledWith('/api/me/confirm-credentials', expect.objectContaining({ method: 'POST' }))
    expect(pk.addPasskey).toHaveBeenCalledOnce()
    expect(m.list.value).toHaveLength(1)
    expect(m.password.value).toBe('') // cleared on success
  })

  it('add: a failed credential gate blocks registration', async () => {
    fetchMock.mockResolvedValue({ valid: false })
    const m = await setup()
    await m.add()
    expect(pk.addPasskey).not.toHaveBeenCalled()
    expect(m.err.value).toBeTruthy()
  })

  it('remove deletes then reloads', async () => {
    pk.deletePasskey.mockResolvedValue({})
    pk.listUserPasskeys.mockResolvedValue({ data: [] })
    const m = await setup()
    await m.remove('abc')
    expect(pk.deletePasskey).toHaveBeenCalledWith({ id: 'abc' })
    expect(pk.listUserPasskeys).toHaveBeenCalled()
  })
})

describe('usePasskeys error branches', () => {
  it('surfaces an addPasskey error after a passed gate', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ valid: true }))
    pk.addPasskey.mockResolvedValue({ error: { message: 'ceremony failed' } })
    const m = await setup()
    await m.add()
    expect(m.err.value).toBe('ceremony failed')
  })

  it('load tolerates a null data payload', async () => {
    pk.listUserPasskeys.mockResolvedValue({ data: null })
    const m = await setup()
    await m.load()
    expect(m.list.value).toEqual([])
  })
})
