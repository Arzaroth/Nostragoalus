<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const is404 = computed(() => props.error.statusCode === 404)
function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center" style="background: var(--p-content-background)">
    <StarField :style="{ zIndex: 0 }" />
    <GoalAnimation miss class="relative z-10" />
    <div class="relative z-10">
      <div class="text-6xl font-black tracking-widest" style="color: var(--p-primary-color)">{{ error.statusCode }}</div>
      <p class="mt-3 max-w-md" style="color: var(--p-text-muted-color)">
        {{ is404 ? t('err.notFound') : error.statusMessage || t('err.generic') }}
      </p>
    </div>
    <Button class="relative z-10" :label="t('err.home')" icon="pi pi-home" @click="goHome" />
  </div>
</template>
