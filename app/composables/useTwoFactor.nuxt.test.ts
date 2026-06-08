import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useTwoFactor } from './useTwoFactor'

// Mock the auth client - keep useSession so the Nuxt app still initializes.
const tf = vi.hoisted(() => ({
  enable: vi.fn(),
  verifyTotp: vi.fn(),
  disable: vi.fn(),
  generateBackupCodes: vi.fn(),
}))
vi.mock('../../lib/auth-client', () => ({
  authClient: {
    twoFactor: tf,
    useSession: () => ref({ data: null }),
  },
}))

// Run the composable inside a real component setup (useI18n etc need it).
async function setup(user: ReturnType<typeof ref>) {
  let api!: ReturnType<typeof useTwoFactor>
  await mountSuspended({
    setup() {
      api = useTwoFactor(user as never)
      return () => null
    },
  })
  return api
}

const user = ref<{ twoFactorEnabled?: boolean } | null>({ twoFactorEnabled: false })

beforeEach(() => {
  Object.values(tf).forEach((f) => f.mockReset())
  user.value = { twoFactorEnabled: false }
  vi.stubGlobal('$fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('useTwoFactor state machine', () => {
  it('enrolls: idle -> verify -> backup -> done', async () => {
    tf.enable.mockResolvedValue({ data: { backupCodes: ['a', 'b'], totpURI: 'otpauth://totp/x?secret=ABC' } })
    tf.verifyTotp.mockResolvedValue({ data: {} })
    const m = await setup(user)

    expect(m.step.value).toBe('idle')
    m.password.value = 'pw'
    await m.startEnable()
    expect(m.step.value).toBe('verify')
    expect(m.backup.value).toEqual(['a', 'b'])
    expect(m.secret.value).toBe('ABC')

    m.code.value = '123456'
    await m.confirmEnable()
    expect(m.step.value).toBe('backup')
    expect(m.password.value).toBe('')

    m.confirmBackupSaved()
    expect(m.step.value).toBe('done')
    expect(m.enabled.value).toBe(true)
    expect(m.backup.value).toEqual([])
  })

  it('surfaces a wrong password on enable and stays idle', async () => {
    tf.enable.mockResolvedValue({ error: { message: 'bad password' } })
    const m = await setup(user)
    await m.startEnable()
    expect(m.step.value).toBe('idle')
    expect(m.err.value).toBe('bad password')
  })

  it('rejects a wrong TOTP at the verify step', async () => {
    tf.enable.mockResolvedValue({ data: { backupCodes: [], totpURI: 'otpauth://totp/x?secret=Z' } })
    tf.verifyTotp.mockResolvedValue({ error: { message: 'nope' } })
    const m = await setup(user)
    await m.startEnable()
    await m.confirmEnable()
    expect(m.step.value).toBe('verify')
    expect(m.err.value).toBeTruthy()
  })

  it('cancel resets all enrollment state', async () => {
    tf.enable.mockResolvedValue({ data: { backupCodes: ['x'], totpURI: 'otpauth://totp/x?secret=Z' } })
    const m = await setup(user)
    await m.startEnable()
    m.cancelEnable()
    expect(m.step.value).toBe('idle')
    expect(m.uri.value).toBe('')
    expect(m.backup.value).toEqual([])
  })

  it('disable requires a valid TOTP before calling disable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ valid: false })
    vi.stubGlobal('$fetch', fetchMock)
    user.value = { twoFactorEnabled: true }
    const m = await setup(user)
    m.disableCode.value = '000000'
    await m.disable()
    expect(tf.disable).not.toHaveBeenCalled()
    expect(m.err.value).toBeTruthy()

    fetchMock.mockResolvedValue({ valid: true })
    tf.disable.mockResolvedValue({ data: {} })
    const onDone = vi.fn()
    await m.disable(onDone)
    expect(tf.disable).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
    expect(m.step.value).toBe('idle')
  })

  it('regenerate surfaces fresh codes', async () => {
    tf.generateBackupCodes.mockResolvedValue({ data: { backupCodes: ['n1', 'n2'] } })
    const m = await setup(user)
    await m.regenerate()
    expect(m.regenCodes.value).toEqual(['n1', 'n2'])
  })
})

describe('useTwoFactor error + edge branches', () => {
  it('secret is empty for an unparseable URI; enable falls back to a generic message', async () => {
    tf.enable.mockResolvedValue({ error: {} }) // no message -> i18n fallback
    const m = await setup(user)
    expect(m.secret.value).toBe('') // uri still ''
    await m.startEnable()
    expect(m.err.value).toBeTruthy()
  })

  it('regenerate and disable surface auth-client errors', async () => {
    tf.generateBackupCodes.mockResolvedValue({ error: { message: 'rl' } })
    const m = await setup(user)
    await m.regenerate()
    expect(m.err.value).toBe('rl')

    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ valid: true }))
    tf.disable.mockResolvedValue({ error: { message: 'bad pw' } })
    await m.disable()
    expect(m.err.value).toBe('bad pw')
  })
})
