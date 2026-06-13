<script setup lang="ts">
import { authClient } from '../../lib/auth-client'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()

const email = ref(String(route.query.email ?? ''))
const sent = ref(false)
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!email.value) return
  error.value = ''
  loading.value = true
  try {
    const { error: err } = await authClient.requestPasswordReset({ email: email.value, redirectTo: '/reset-password' })
    if (err) {
      error.value = err.message ?? 'Failed'
      return
    }
    sent.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20 mx-auto" >
    <h1 class="text-2xl font-bold">{{ t('auth.resetTitle') }}</h1>
    <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('auth.resetHint') }}</p>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <Message v-if="sent" severity="success">{{ t('auth.resetSent') }}</Message>
    <template v-if="!sent">
      <InputText v-model="email" type="email" :placeholder="t('auth.email')" @keyup.enter="submit" />
      <Button :label="t('auth.resetSend')" :loading="loading" :disabled="!email" @click="submit" />
    </template>
    <NuxtLink to="/login" class="text-sm text-center">{{ t('auth.signIn') }}</NuxtLink>
  </div>
</template>
