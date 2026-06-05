<script setup lang="ts">
const { t } = useI18n()
const { signUp } = useAuth()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
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
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <h1 class="text-2xl font-bold">{{ t('auth.signUp') }}</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <InputText v-model="name" :placeholder="t('auth.displayName')" />
    <InputText v-model="email" type="email" :placeholder="t('auth.email')" />
    <Password v-model="password" :placeholder="t('auth.password')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" />
    <Button :label="t('auth.signUp')" :loading="loading" @click="submit" />
    <NuxtLink to="/login" class="text-sm text-center">{{ t('auth.haveAccount') }}</NuxtLink>
  </div>
</template>
