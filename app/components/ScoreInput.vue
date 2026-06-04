<script setup lang="ts">
const props = defineProps<{ home: number | null; away: number | null; disabled?: boolean }>()
const emit = defineEmits<{ update: [value: { home: number; away: number }] }>()

const home = ref(props.home ?? 0)
const away = ref(props.away ?? 0)

watch(
  () => [props.home, props.away],
  () => {
    home.value = props.home ?? 0
    away.value = props.away ?? 0
  },
)
</script>

<template>
  <div class="flex items-center gap-2">
    <InputNumber
      v-model="home"
      :min="0"
      :max="99"
      :disabled="disabled"
      show-buttons
      button-layout="vertical"
      :input-style="{ width: '3rem', textAlign: 'center' }"
    />
    <span class="font-bold">:</span>
    <InputNumber
      v-model="away"
      :min="0"
      :max="99"
      :disabled="disabled"
      show-buttons
      button-layout="vertical"
      :input-style="{ width: '3rem', textAlign: 'center' }"
    />
    <Button v-if="!disabled" label="Save" size="small" @click="emit('update', { home, away })" />
  </div>
</template>
