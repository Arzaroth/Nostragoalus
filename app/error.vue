<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const code = computed(() => props.error.statusCode)
const isTeapot = computed(() => code.value === 418)
const isServerError = computed(() => code.value === 500)
// Each status keeps its own line; 418 and 500 also get their own animation
// (teapot / red card), everything else keeps the missed-shot goal.
const message = computed(() => {
  if (isTeapot.value) return t('err.teapot')
  if (code.value === 404) return t('err.notFound')
  if (isServerError.value) return t('err.serverError')
  return props.error.statusMessage || t('err.generic')
})
function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center" style="background: var(--p-content-background)">
    <StarField :style="{ zIndex: 0 }" />
    <TeapotAnimation v-if="isTeapot" class="relative z-10" />
    <RedCardAnimation v-else-if="isServerError" class="relative z-10" />
    <GoalAnimation v-else miss class="relative z-10" />
    <div class="relative z-10">
      <div class="text-6xl font-black tracking-widest" style="color: var(--p-primary-color)">{{ error.statusCode }}</div>
      <p class="mt-3 max-w-md" style="color: var(--p-text-muted-color)">{{ message }}</p>
    </div>
    <Button class="relative z-10" :label="t('err.home')" icon="pi pi-home" @click="goHome" />
  </div>
</template>
