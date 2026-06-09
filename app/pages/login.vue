<script setup lang="ts">
import { authClient } from '../../lib/auth-client'
const { t } = useI18n()
const { signIn } = useAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const redirecting = ref(false)
const passwordWrap = ref<HTMLElement | null>(null)

// /login?password=1 escape hatch: skips domain capture so a password account
// (e.g. the admin) can still get in when the IdP is down.
const forcePassword = route.query.password !== undefined
const step = ref<'email' | 'password'>(forcePassword ? 'password' : 'email')

// Changing the identifier invalidates a revealed password step: the new
// domain may be SSO-captured.
watch(email, () => {
  if (!forcePassword) step.value = 'email'
})

async function next() {
  if (step.value === 'password') {
    await submit()
    return
  }
  if (!email.value) return
  error.value = ''
  loading.value = true
  try {
    const { providerId } = await $fetch<{ providerId: string | null }>('/api/sso/check', { query: { email: email.value } })
    if (providerId) {
      redirecting.value = true
      const { error: err } = await signIn.sso({ providerId, callbackURL: '/matches' })
      if (err) {
        redirecting.value = false
        error.value = err.message ?? 'SSO failed'
      }
      return
    }
    step.value = 'password'
    await nextTick()
    passwordWrap.value?.querySelector('input')?.focus()
  } finally {
    loading.value = false
  }
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const { error: err } = await signIn.email({ email: email.value, password: password.value })
    if (err) {
      error.value = err.message ?? 'Sign in failed'
      return
    }
    await router.push('/matches')
  } finally {
    loading.value = false
  }
}

async function signInPasskey() {
  error.value = ''
  const res = await authClient.signIn.passkey()
  if (res?.error) {
    error.value = res.error.message || t('passkeys.failed')
    return
  }
  await router.push('/matches')
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20 mx-auto" >
    <h1 class="text-2xl font-bold">{{ t('auth.signIn') }}</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <Message v-if="redirecting" severity="info">{{ t('auth.ssoRedirect') }}</Message>
    <InputText v-model="email" type="email" :placeholder="t('auth.email')" @keyup.enter="next" />
    <div v-if="step === 'password'" ref="passwordWrap" class="flex flex-col">
      <Password v-model="password" :placeholder="t('auth.password')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" @keyup.enter="submit" />
    </div>
    <Button :label="step === 'password' ? t('auth.signIn') : t('auth.continue')" :loading="loading" @click="next" />
    <div class="flex items-center gap-3 text-xs my-1" style="color: var(--p-text-muted-color)">
      <div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />{{ t('auth.or') }}<div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
    </div>
    <Button :label="t('passkeys.signIn')" icon="pi pi-id-card" severity="secondary" outlined @click="signInPasskey" />
    <NuxtLink to="/signup" class="text-sm text-center">{{ t('auth.needAccount') }}</NuxtLink>
    <div class="flex justify-center mt-6 opacity-75"><GuestPrefs /></div>
  </div>
</template>
