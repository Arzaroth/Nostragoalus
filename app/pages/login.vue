<script setup lang="ts">
const { t } = useI18n()
const { signIn } = useAuth()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

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

async function signInGoogle() {
  await signIn.social({ provider: 'google', callbackURL: '/matches' })
}

async function signInSSO() {
  error.value = ''
  if (!email.value) {
    error.value = t('auth.ssoEmailHint')
    return
  }
  const { error: err } = await signIn.sso({ email: email.value, callbackURL: '/matches' })
  if (err) error.value = err.message ?? 'SSO failed'
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <h1 class="text-2xl font-bold">{{ t('auth.signIn') }}</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <InputText v-model="email" type="email" :placeholder="t('auth.email')" @keyup.enter="submit" />
    <Password v-model="password" :placeholder="t('auth.password')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" @keyup.enter="submit" />
    <Button :label="t('auth.signIn')" :loading="loading" @click="submit" />
    <div class="flex items-center gap-3 text-xs my-1" style="color: var(--p-text-muted-color)">
      <div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />{{ t('auth.or') }}<div class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
    </div>
    <Button :label="t('auth.google')" icon="pi pi-google" severity="secondary" outlined @click="signInGoogle" />
    <Button :label="t('auth.sso')" icon="pi pi-key" severity="secondary" outlined @click="signInSSO" />
    <NuxtLink to="/signup" class="text-sm text-center">{{ t('auth.needAccount') }}</NuxtLink>
  </div>
</template>
