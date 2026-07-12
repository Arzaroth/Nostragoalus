import { useQRCode } from '@vueuse/integrations/useQRCode'
import { authClient } from '../../lib/auth-client'

export type TwoFactorStep = 'idle' | 'verify' | 'backup' | 'done'

// The whole 2FA enrollment/disable state machine, extracted from account.vue so
// the auth-critical transitions are a testable unit. Backup codes are a
// confirmed step (shown only during enrollment), disabling needs a fresh TOTP.
export function useTwoFactor(currentUser: Ref<{ twoFactorEnabled?: boolean | null } | null | undefined>) {
  const { t } = useI18n()

  const password = ref('')
  const code = ref('')
  const uri = ref('')
  const qr = useQRCode(uri, { margin: 1, width: 192 })
  const backup = ref<string[]>([])
  const step = ref<TwoFactorStep>('idle')
  const err = ref('')
  const busy = ref(false)
  const disableCode = ref('')
  const regenCodes = ref<string[]>([])
  const regenBusy = ref(false)

  const enabled = computed(() => (currentUser.value as any)?.twoFactorEnabled === true || step.value === 'done')
  const secret = computed(() => {
    try {
      return new URL(uri.value).searchParams.get('secret') ?? ''
    } catch {
      return ''
    }
  })

  async function startEnable() {
    err.value = ''
    busy.value = true
    try {
      const res = await authClient.twoFactor.enable({ password: password.value })
      if (res.error) {
        err.value = res.error.message || t('twofa.wrongPassword')
        return
      }
      backup.value = res.data?.backupCodes ?? []
      uri.value = res.data?.totpURI ?? ''
      step.value = 'verify'
    } finally {
      busy.value = false
    }
  }

  async function confirmEnable() {
    err.value = ''
    busy.value = true
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: String(code.value).trim() })
      if (res.error) {
        err.value = t('twofa.wrongCode')
        return
      }
      // Code accepted: walk the user through saving backup codes before finishing.
      step.value = 'backup'
      password.value = ''
      code.value = ''
    } finally {
      busy.value = false
    }
  }

  function cancelEnable() {
    step.value = 'idle'
    err.value = ''
    password.value = ''
    code.value = ''
    uri.value = ''
    backup.value = []
  }

  function confirmBackupSaved() {
    step.value = 'done'
    backup.value = []
  }

  async function regenerate() {
    err.value = ''
    regenBusy.value = true
    try {
      const res = await authClient.twoFactor.generateBackupCodes({ password: password.value })
      if (res.error) {
        err.value = res.error.message || t('twofa.wrongPassword')
        return
      }
      regenCodes.value = res.data?.backupCodes ?? []
    } finally {
      regenBusy.value = false
    }
  }

  async function disable(onDone?: () => void | Promise<void>) {
    err.value = ''
    busy.value = true
    try {
      // A valid current TOTP code on top of the password.
      const check = await $fetch<{ valid: boolean }>('/api/me/confirm-totp', {
        method: 'POST',
        body: { code: String(disableCode.value) },
      })
      if (!check.valid) {
        err.value = t('twofa.wrongCode')
        return
      }
      const res = await authClient.twoFactor.disable({ password: password.value })
      if (res.error) {
        err.value = res.error.message || t('twofa.wrongPassword')
        return
      }
      step.value = 'idle'
      password.value = ''
      disableCode.value = ''
      uri.value = ''
      backup.value = []
      await onDone?.()
    } finally {
      busy.value = false
    }
  }

  return {
    password,
    code,
    uri,
    qr,
    backup,
    step,
    err,
    busy,
    disableCode,
    regenCodes,
    regenBusy,
    enabled,
    secret,
    startEnable,
    confirmEnable,
    cancelEnable,
    confirmBackupSaved,
    regenerate,
    disable,
  }
}
