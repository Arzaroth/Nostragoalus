<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ password: string }>()

// 0–4: length, length+, mixed case, digit, symbol (capped at 4).
const score = computed(() => {
  const p = props.password
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s += 1
  if (p.length >= 12) s += 1
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1
  if (/\d/.test(p)) s += 1
  if (/[^A-Za-z0-9]/.test(p)) s += 1
  return Math.min(s, 4)
})

const colors = ['var(--ng-danger)', '#f97316', '#eab308', '#84cc16', 'var(--ng-success)']
const keys = ['veryWeak', 'weak', 'fair', 'good', 'strong']
</script>

<template>
  <div v-if="password" class="flex flex-col gap-1">
    <div class="flex gap-1">
      <div
        v-for="i in 4"
        :key="i"
        class="h-1 flex-1 rounded-full transition-colors"
        :style="`background:${i <= score ? colors[score] : 'var(--p-content-border-color)'}`"
      />
    </div>
    <span class="text-xs" :style="`color:${colors[score]}`">{{ t(`strength.${keys[score]}`) }}</span>
  </div>
</template>
