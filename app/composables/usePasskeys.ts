import { authClient } from '../../lib/auth-client'

export interface PasskeyRow {
  id: string
  name: string | null
  createdAt: string | null
  deviceType: string
}

// Passkey management, extracted from account.vue. Registration is sudo-gated:
// the password (+ TOTP when 2FA is on) is confirmed server-side first, since a
// passkey grants account access.
export function usePasskeys() {
  const { t } = useI18n()
  const list = ref<PasskeyRow[]>([])
  const busy = ref(false)
  const err = ref('')
  const name = ref('')
  const password = ref('')
  const code = ref('')

  async function load() {
    const res = await authClient.passkey.listUserPasskeys()
    list.value = (res.data as unknown as PasskeyRow[]) ?? []
  }

  async function add() {
    err.value = ''
    busy.value = true
    try {
      const gate = await $fetch<{ valid: boolean }>('/api/me/confirm-credentials', {
        method: 'POST',
        body: { password: password.value, code: String(code.value || '') },
      })
      if (!gate.valid) {
        err.value = t('passkeys.gateFailed')
        return
      }
      const res = await authClient.passkey.addPasskey({ name: name.value || undefined })
      if (res?.error) {
        err.value = res.error.message || 'Failed'
        return
      }
      name.value = ''
      password.value = ''
      code.value = ''
      await load()
    } finally {
      busy.value = false
    }
  }

  async function remove(id: string) {
    await authClient.passkey.deletePasskey({ id })
    await load()
  }

  return { list, busy, err, name, password, code, load, add, remove }
}
