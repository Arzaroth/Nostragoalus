<script setup lang="ts">
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
</script>

<template>
  <div class="flex flex-col gap-3 max-w-sm mx-auto mt-12">
    <h1 class="text-2xl font-bold">Sign in</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <InputText v-model="email" type="email" placeholder="Email" @keyup.enter="submit" />
    <Password v-model="password" placeholder="Password" :feedback="false" toggle-mask :input-style="{ width: '100%' }" @keyup.enter="submit" />
    <Button label="Sign in" :loading="loading" @click="submit" />
    <NuxtLink to="/signup" class="text-sm text-center">Need an account? Sign up</NuxtLink>
  </div>
</template>
