<script setup lang="ts">
import type { League } from '../composables/useLeagues'

const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ joined: [league: League] }>()

const { t } = useI18n()
const { join } = useLeagueActions()
const code = ref('')
const error = ref('')

watch(visible, (open) => {
  if (open) {
    code.value = ''
    error.value = ''
  }
})

async function submit() {
  if (!code.value.trim()) return
  error.value = ''
  try {
    const league = await join.mutateAsync({ code: code.value })
    emit('joined', league)
  } catch (e: any) {
    error.value = e?.statusCode === 409 ? t('leagues.alreadyMember') : t('leagues.joinInvalid')
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :draggable="false" :header="t('leagues.joinTitle')" class="w-full max-w-sm mx-4">
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <label class="text-sm font-medium" for="league-join-code">{{ t('leagues.joinCodeLabel') }}</label>
      <InputText
        id="league-join-code"
        v-model="code"
        :placeholder="t('leagues.joinCodePlaceholder')"
        autocomplete="off"
        autofocus
        class="w-full uppercase"
      />
      <Message v-if="error" severity="error" size="small" variant="simple">{{ error }}</Message>
      <div class="flex justify-end gap-2 mt-1">
        <Button type="button" :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="t('leagues.joinSubmit')" :loading="join.isPending.value" :disabled="!code.trim()" />
      </div>
    </form>
  </Dialog>
</template>
