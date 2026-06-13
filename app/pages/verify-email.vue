<script setup lang="ts">
import { authClient } from '../../lib/auth-client'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 'checking' until the client resolves the session: a fresh verification
// auto-signs the user in (session present) so we send them into the app; an
// already-used link or an error redirect arrives without a session, so we show
// a confirmation and point at sign-in. better-auth appends ?error= on a bad or
// expired token.
const state = ref<'checking' | 'verified' | 'error'>('checking')

onMounted(async () => {
  if (route.query.error) {
    state.value = 'error'
    return
  }
  const { data } = await authClient.getSession()
  if (data) {
    await router.replace('/matches')
    return
  }
  state.value = 'verified'
})
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12 items-center text-center">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20" >
    <p v-if="state === 'checking'" style="color: var(--p-text-muted-color)">{{ t('auth.verifyChecking') }}</p>
    <template v-else-if="state === 'verified'">
      <Message severity="success">{{ t('auth.verifyDone') }}</Message>
      <NuxtLink to="/login" class="text-sm">{{ t('auth.goToSignIn') }}</NuxtLink>
    </template>
    <template v-else>
      <Message severity="warn">{{ t('auth.verifyError') }}</Message>
      <NuxtLink to="/login" class="text-sm">{{ t('auth.goToSignIn') }}</NuxtLink>
    </template>
  </div>
</template>
