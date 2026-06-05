<script setup lang="ts">
const props = defineProps<{ home: number | null; away: number | null; disabled?: boolean }>()
const emit = defineEmits<{ update: [value: { home: number; away: number }] }>()

const home = ref<number | null>(props.home)
const away = ref<number | null>(props.away)
const saved = ref(false)

watch(
  () => [props.home, props.away],
  () => {
    home.value = props.home
    away.value = props.away
  },
)

const dirty = computed(() => home.value != null && away.value != null && (home.value !== props.home || away.value !== props.away))

// Auto-save when both scores are set and changed — no Save button to spawn/shift the row.
function commit() {
  if (!dirty.value) return
  emit('update', { home: home.value as number, away: away.value as number })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <div class="flex items-center justify-center gap-2">
      <InputNumber v-model="home" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="home = $event.value" @blur="commit" @keyup.enter="commit" />
      <span class="font-bold opacity-60">:</span>
      <InputNumber v-model="away" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="away = $event.value" @blur="commit" @keyup.enter="commit" />
    </div>
    <div v-if="!disabled" class="h-3.5 leading-none" style="color: var(--p-primary-color)">
      <i v-if="saved" class="pi pi-check" style="font-size: 0.72rem" />
    </div>
  </div>
</template>
