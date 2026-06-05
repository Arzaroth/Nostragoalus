<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{ home: number | null; away: number | null; disabled?: boolean }>()
const emit = defineEmits<{ update: [value: { home: number; away: number }] }>()

const home = ref<number | null>(props.home)
const away = ref<number | null>(props.away)

watch(
  () => [props.home, props.away],
  () => {
    home.value = props.home
    away.value = props.away
  },
)

const canSave = computed(() => home.value != null && away.value != null)
const dirty = computed(() => canSave.value && (home.value !== props.home || away.value !== props.away))
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div class="flex items-center justify-center gap-2">
      <InputNumber v-model="home" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="home = $event.value" />
      <span class="font-bold opacity-60">:</span>
      <InputNumber v-model="away" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="away = $event.value" />
    </div>
    <Button
      v-if="!disabled && dirty"
      :label="t('common.save')"
      size="small"
      @click="emit('update', { home: home as number, away: away as number })"
    />
  </div>
</template>
