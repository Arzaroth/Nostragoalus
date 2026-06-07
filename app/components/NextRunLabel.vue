<script setup lang="ts">
// Self-contained ticking label: the 1s clock re-renders only this component,
// not the parent. (PrimeVue's tooltip directive unbinds on every host
// re-render, so a ticking parent dismisses any open tooltip.)
const props = defineProps<{ step: number | 'hourly' | null }>()
const { t } = useI18n()

const nowTick = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tick = setInterval(() => (nowTick.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(tick))

const label = computed(() => {
  if (props.step === null) return t('admin.data.manual')
  const d = new Date(nowTick.value)
  const next = new Date(d)
  next.setSeconds(0, 0)
  if (props.step === 'hourly') {
    next.setMinutes(0)
    next.setHours(d.getHours() + 1)
  } else {
    next.setMinutes(d.getMinutes() + (props.step - (d.getMinutes() % props.step)))
  }
  return next.toLocaleTimeString()
})
</script>

<template>
  <span class="text-xs tabular-nums" style="color: var(--p-text-muted-color)">{{ t('admin.data.nextRun') }}: {{ label }}</span>
</template>
