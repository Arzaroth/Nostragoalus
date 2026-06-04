<script setup lang="ts">
const { session, signOut } = useAuth()
const router = useRouter()

async function onSignOut() {
  await signOut()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header
      class="flex items-center gap-4 px-6 py-3 border-b"
      style="border-color: var(--p-content-border-color)"
    >
      <NuxtLink to="/" class="text-xl font-bold no-underline" style="color: var(--p-primary-color)">
        ⚽ MPP
      </NuxtLink>
      <nav class="flex gap-4 flex-1 text-sm">
        <NuxtLink to="/matches">Matches</NuxtLink>
        <NuxtLink to="/leaderboard">Leaderboard</NuxtLink>
        <NuxtLink to="/predictions">My picks</NuxtLink>
      </nav>
      <template v-if="session?.data">
        <span class="text-sm opacity-70">{{ session.data.user.name }}</span>
        <Button label="Sign out" size="small" severity="secondary" @click="onSignOut" />
      </template>
      <NuxtLink v-else to="/login">
        <Button label="Sign in" size="small" />
      </NuxtLink>
    </header>

    <main class="flex-1 p-6 w-full max-w-screen-lg mx-auto">
      <slot />
    </main>
  </div>
</template>
