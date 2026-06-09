<script setup lang="ts">
const { t } = useI18n()
const { signUp, signIn } = useAuth()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

// Domain capture warning: signing up with a password on an SSO-captured domain
// is allowed, but only after an explicit "continue anyway" (the IdP is the
// expected way in for those domains).
const ssoWarn = ref<{ providerId: string; name: string } | null>(null)
const ssoAcknowledged = ref(false)
watch(email, () => {
  ssoWarn.value = null
  ssoAcknowledged.value = false
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    if (!ssoAcknowledged.value && email.value) {
      const res = await $fetch<{ providerId: string | null; name: string | null }>('/api/sso/check', { query: { email: email.value } })
      if (res.providerId) {
        ssoWarn.value = { providerId: res.providerId, name: res.name ?? res.providerId }
        return
      }
    }
    const { error: err } = await signUp.email({ name: name.value, email: email.value, password: password.value })
    if (err) {
      error.value = err.message ?? 'Sign up failed'
      return
    }
    await router.push('/matches')
  } finally {
    loading.value = false
  }
}

function continueAnyway() {
  ssoAcknowledged.value = true
  ssoWarn.value = null
  void submit()
}

async function useSso() {
  if (!ssoWarn.value) return
  const { error: err } = await signIn.sso({ providerId: ssoWarn.value.providerId, callbackURL: '/matches' })
  if (err) error.value = err.message ?? 'SSO failed'
}

async function signInGoogle() {
  await signIn.social({ provider: 'google', callbackURL: '/matches' })
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20 mx-auto" >
    <h1 class="text-2xl font-bold">{{ t('auth.signUp') }}</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <Message v-if="ssoWarn" severity="warn">
      <div class="flex flex-col gap-2">
        <span>{{ t('auth.ssoDomainWarn', { name: ssoWarn.name }) }}</span>
        <div class="grid grid-cols-2 gap-2 items-stretch">
          <Button :label="t('auth.ssoDomainUse', { name: ssoWarn.name })" size="small" class="justify-center text-center" @click="useSso" />
          <Button :label="t('auth.ssoDomainContinue')" size="small" severity="secondary" outlined class="justify-center text-center" @click="continueAnyway" />
        </div>
      </div>
    </Message>
    <InputText v-model="name" :placeholder="t('auth.displayName')" @keyup.enter="submit" />
    <InputText v-model="email" type="email" :placeholder="t('auth.email')" @keyup.enter="submit" />
    <Password v-model="password" :placeholder="t('auth.password')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" @keyup.enter="submit" />
    <PasswordStrength :password="password" />
    <Button :label="t('auth.signUp')" :loading="loading" @click="submit" />
    <div class="flex items-center gap-3 text-xs my-1" style="color: var(--p-text-muted-color)">
      <div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />{{ t('auth.or') }}<div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
    </div>
    <NuxtLink to="/login" class="text-sm text-center">{{ t('auth.haveAccount') }}</NuxtLink>
    <div class="flex justify-center mt-6 opacity-75"><GuestPrefs /></div>
  </div>
</template>
