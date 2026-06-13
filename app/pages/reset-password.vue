<script setup lang="ts">
import { authClient } from '../../lib/auth-client'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// better-auth's mail link lands here with ?token= on success or ?error= when
// the link is invalid/expired.
const token = String(route.query.token ?? '')
const linkError = !token || route.query.error !== undefined

const password = ref('')
const confirm = ref('')
const error = ref('')
const done = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = t('account.passwordMismatch')
    return
  }
  loading.value = true
  try {
    const { error: err } = await authClient.resetPassword({ newPassword: password.value, token })
    if (err) {
      error.value = err.message ?? 'Failed'
      return
    }
    done.value = true
    setTimeout(() => router.push('/login'), 1500)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20 mx-auto" >
    <h1 class="text-2xl font-bold">{{ t('auth.resetTitle') }}</h1>
    <Message v-if="linkError" severity="error">{{ t('auth.resetInvalid') }}</Message>
    <template v-else>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <Message v-if="done" severity="success">{{ t('auth.resetDone') }}</Message>
      <template v-if="!done">
        <Password v-model="password" :placeholder="t('auth.resetNew')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" />
        <PasswordStrength :password="password" />
        <Password v-model="confirm" :placeholder="t('account.confirmPassword')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" @keyup.enter="submit" />
        <Button :label="t('auth.resetSubmit')" :loading="loading" :disabled="!password || !confirm" @click="submit" />
      </template>
    </template>
    <NuxtLink to="/login" class="text-sm text-center">{{ t('auth.signIn') }}</NuxtLink>
  </div>
</template>
