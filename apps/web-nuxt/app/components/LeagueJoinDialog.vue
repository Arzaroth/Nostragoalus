<script setup lang="ts">
import type { League } from '../composables/useLeagues'

const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ joined: [league: League] }>()

const { t } = useI18n()
const { join } = useLeagueActions()
const router = useRouter()
const code = ref('')
const error = ref('')
// Set when the field holds a pasted invite link rather than a join code; submit
// then routes to the invite page instead of the join-by-code endpoint.
const inviteToken = ref<string | null>(null)

watch(visible, (open) => {
  if (open) {
    code.value = ''
    error.value = ''
    inviteToken.value = null
  }
})

// Pasting a full invite link is the common share path - pull the token out and
// rewrite the field to just the token, so the input always shows what's used.
watch(code, (v) => {
  const m = v.match(/\/leagues\/join\/([A-Za-z0-9_-]+)/)
  if (m) {
    inviteToken.value = m[1]!
    code.value = m[1]!
  } else if (inviteToken.value && v !== inviteToken.value) {
    inviteToken.value = null
  }
})

async function submit() {
  if (!code.value.trim()) return
  if (inviteToken.value) {
    visible.value = false
    await router.push(`/leagues/join/${inviteToken.value}`)
    return
  }
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
        class="w-full"
        :class="{ uppercase: !inviteToken }"
      />
      <Message v-if="error" severity="error" size="small" variant="simple">{{ error }}</Message>
      <div class="flex justify-end gap-2 mt-1">
        <Button type="button" :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
        <Button type="submit" :label="t('leagues.joinSubmit')" :loading="join.isPending.value" :disabled="!code.trim()" />
      </div>
    </form>
  </Dialog>
</template>
