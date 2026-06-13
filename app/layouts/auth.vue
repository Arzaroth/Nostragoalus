<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b" style="border-color: var(--p-content-border-color)">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center">
        <NuxtLink to="/" class="flex items-center gap-2 font-extrabold text-lg">
          <LogoMark class="h-10 w-auto shrink-0" />
          <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
            {{ config.public.appName }}
          </span>
        </NuxtLink>
      </div>
    </header>

    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
