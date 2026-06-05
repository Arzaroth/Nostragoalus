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
</script>

<template>
  <div class="flex items-center justify-center gap-2">
    <InputNumber v-model="home" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" />
    <span class="font-bold opacity-60">:</span>
    <InputNumber v-model="away" :min="0" :max="99" :disabled="disabled" placeholder="–" :input-style="{ width: '2.6rem', textAlign: 'center' }" />
    <Button
      v-if="!disabled"
      :label="t('common.save')"
      size="small"
      :disabled="!canSave"
      @click="canSave && emit('update', { home: home as number, away: away as number })"
    />
  </div>
</template>
