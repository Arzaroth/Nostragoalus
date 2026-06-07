<script setup lang="ts">
import { authClient } from '../../lib/auth-client'

const { t } = useI18n()
const code = ref('')
const trustDevice = ref(true)
const mode = ref<'totp' | 'backup' | 'otp'>('totp')
const error = ref('')
const info = ref('')
const loading = ref(false)

async function verify() {
  error.value = ''
  loading.value = true
  try {
    const payload = { code: code.value.trim(), trustDevice: trustDevice.value }
    const res =
      mode.value === 'totp'
        ? await authClient.twoFactor.verifyTotp(payload)
        : mode.value === 'otp'
          ? await authClient.twoFactor.verifyOtp(payload)
          : await authClient.twoFactor.verifyBackupCode({ code: code.value.trim() })
    if (res.error) {
      error.value = t('twofa.wrongCode')
      return
    }
    await navigateTo('/')
  } finally {
    loading.value = false
  }
}

async function sendEmailCode() {
  error.value = ''
  info.value = ''
  const res = await authClient.twoFactor.sendOtp()
  if (res.error) {
    error.value = res.error.message || t('twofa.emailUnavailable')
    return
  }
  mode.value = 'otp'
  info.value = t('twofa.emailSent')
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20 mx-auto" >
    <h1 class="text-2xl font-bold text-center">{{ t('twofa.title') }}</h1>
    <p class="text-sm text-center" style="color: var(--p-text-muted-color)">
      {{ mode === 'backup' ? t('twofa.backupHint') : mode === 'otp' ? t('twofa.otpHint') : t('twofa.hint') }}
    </p>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <Message v-if="info" severity="info">{{ info }}</Message>

    <div v-if="mode !== 'backup'" class="flex justify-center">
      <InputOtp v-model="code" :length="6" integer-only @keyup.enter="verify" />
    </div>
    <InputText v-else v-model="code" :placeholder="t('twofa.backupCode')" class="text-center tracking-widest" autofocus @keyup.enter="verify" />
    <label v-if="mode !== 'backup'" class="flex items-center gap-2 text-sm" style="color: var(--p-text-muted-color)">
      <Checkbox v-model="trustDevice" binary /> {{ t('twofa.trust') }}
    </label>
    <Button :label="t('twofa.verify')" :loading="loading" :disabled="!code.trim()" @click="verify" />

    <div class="flex flex-col gap-1 text-sm text-center mt-2">
      <button v-if="mode !== 'totp'" type="button" class="hover:underline" style="color: var(--p-primary-color)" @click="mode = 'totp'; error = ''">
        {{ t('twofa.useTotp') }}
      </button>
      <button v-if="mode !== 'backup'" type="button" class="hover:underline" style="color: var(--p-text-muted-color)" @click="mode = 'backup'; error = ''">
        {{ t('twofa.useBackup') }}
      </button>
      <button type="button" class="hover:underline" style="color: var(--p-text-muted-color)" @click="sendEmailCode">
        {{ t('twofa.emailCode') }}
      </button>
    </div>
  </div>
</template>
