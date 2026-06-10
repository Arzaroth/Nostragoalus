<script setup lang="ts">
// Tiny in-house confirm (PrimeVue's ConfirmDialog needs the confirmation
// service; this stays a plain prop-driven component).
const visible = defineModel<boolean>('visible', { required: true })
const props = defineProps<{
  header: string
  message: string
  confirmLabel?: string
  severity?: 'danger' | 'primary'
}>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()

function confirm() {
  // Emit first: hiding sets visible=false, and parents that clear their target
  // ref in @update:visible would otherwise null it before @confirm reads it.
  emit('confirm')
  visible.value = false
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :draggable="false" :header="props.header" class="w-full max-w-sm mx-4">
    <p class="text-sm">{{ props.message }}</p>
    <div class="flex justify-end gap-2 mt-4">
      <Button type="button" :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
      <Button type="button" :label="props.confirmLabel ?? t('common.confirm')" :severity="props.severity ?? 'primary'" @click="confirm" />
    </div>
  </Dialog>
</template>
