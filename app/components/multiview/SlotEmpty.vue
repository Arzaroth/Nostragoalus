<script setup lang="ts">
const { t } = useI18n()
defineEmits<{ add: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex flex-col items-center justify-center w-full h-full rounded-xl border-2 border-dashed transition hover:bg-black/5 dark:hover:bg-white/5"
    style="border-color: var(--p-content-border-color)"
    @click="$emit('add')"
  >
    <i class="pi pi-plus text-2xl opacity-70" />
    <span class="mt-2 text-sm" style="color: var(--p-text-muted-color)">{{ t('multiview.addMatch') }}</span>
  </button>
</template>
