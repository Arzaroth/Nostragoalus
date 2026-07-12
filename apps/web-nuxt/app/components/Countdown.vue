<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ to: string }>()

// Rendered only after mount (the label depends on "now", which would mismatch SSR).
const mounted = useMounted()
const now = useTimestamp({ interval: 30_000 })

const MAX_MS = 45 * 24 * 60 * 60 * 1000 // beyond ~6 weeks a countdown is just noise

const label = computed(() => {
  if (!mounted.value) return null
  const ms = new Date(props.to).getTime() - now.value
  if (ms <= 0 || ms > MAX_MS) return null
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}${t('countdown.d')} ${h}${t('countdown.h')}`
  if (h > 0) return `${h}${t('countdown.h')} ${m}${t('countdown.m')}`
  return `${m}${t('countdown.m')}`
})
</script>

<template>
  <span v-if="label" class="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap" style="color: var(--p-primary-color)">
    <i class="pi pi-clock" style="font-size: 0.7rem" />{{ label }}
  </span>
</template>
