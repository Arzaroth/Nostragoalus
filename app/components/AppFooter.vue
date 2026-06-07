<script setup lang="ts">
const { t } = useI18n()
const config = useRuntimeConfig()
</script>

<template>
  <footer class="text-center text-sm flex flex-col gap-2" style="color: var(--p-text-muted-color)">
    <div>© 2026 {{ config.public.appName }} · {{ t('landing.footer') }}</div>
    <div>{{ t('footer.builtWith') }}</div>
    <div class="flex justify-center gap-4 text-xs">
      <NuxtLink to="/about" class="hover:underline">{{ t('about.title') }}</NuxtLink>
      <a href="/docs/api" target="_blank" rel="noopener" class="hover:underline">API</a>
      <a href="https://git.arzaroth.com/Arzaroth/Nostragoalus" target="_blank" rel="noopener" class="hover:underline">{{ t('footer.source') }}</a>
      <NuxtLink to="/license" class="hover:underline">WTFPL</NuxtLink>
    </div>
  </footer>
</template>
