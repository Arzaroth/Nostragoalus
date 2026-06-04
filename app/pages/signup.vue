<script setup lang="ts">
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
    <h1 class="text-2xl font-bold">Create account</h1>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <InputText v-model="name" placeholder="Display name" />
    <InputText v-model="email" type="email" placeholder="Email" />
    <Password v-model="password" placeholder="Password (min 8 chars)" :feedback="false" toggle-mask :input-style="{ width: '100%' }" />
    <Button label="Sign up" :loading="loading" @click="submit" />
    <NuxtLink to="/login" class="text-sm text-center">Already have an account? Sign in</NuxtLink>
  </div>
</template>
