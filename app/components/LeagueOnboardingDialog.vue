<script setup lang="ts">
// One-time "got a league code?" prompt. Server-side flag
// (leaguePromptDismissedAt rides on the session user) + no memberships =
// show once. Mounted client-only and starts hidden, so it can only appear,
// never flash away during hydration.
const { t } = useI18n()
const { session } = useAuth()
const { join } = useLeagueActions()
const mine = useMyLeagues()

const dismissedLocally = ref(false)
const code = ref('')
const error = ref('')

const flagUnset = computed(() => {
  const user = session.value?.data?.user as { leaguePromptDismissedAt?: string | Date | null } | undefined
  return !!user && (user.leaguePromptDismissedAt === null || user.leaguePromptDismissedAt === undefined)
})

const visible = computed(
  () =>
    !dismissedLocally.value &&
    flagUnset.value &&
    mine.isSuccess.value &&
    (mine.data.value?.length ?? 0) === 0,
)

// Any exit path dismisses server-side: the prompt is one-time by design.
async function dismiss() {
  dismissedLocally.value = true
  try {
    await $fetch('/api/me/league-prompt', { method: 'POST' })
  } catch {
    // Worst case the prompt shows once more on the next visit.
  }
}

async function submit() {
  if (!code.value.trim()) return
  error.value = ''
  try {
    await join.mutateAsync({ code: code.value })
    dismissedLocally.value = true
  } catch (e: any) {
    error.value = e?.statusCode === 409 ? t('leagues.alreadyMember') : t('leagues.joinInvalid')
  }
}

async function goCreate() {
  await dismiss()
  await navigateTo('/leagues?create=1')
}

async function goBrowse() {
  await dismiss()
  await navigateTo('/leagues')
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :draggable="false"
    :closable="false"
    :close-on-escape="false"
    :header="t('leagues.onboardTitle')"
    class="w-full max-w-md mx-4"
  >
    <p class="text-sm mb-4" style="color: var(--p-text-muted-color)">{{ t('leagues.onboardBody') }}</p>
    <form class="flex gap-2" @submit.prevent="submit">
      <InputText
        v-model="code"
        :placeholder="t('leagues.joinCodePlaceholder')"
        autocomplete="off"
        class="flex-1 uppercase"
        :aria-label="t('leagues.joinCodeLabel')"
      />
      <Button type="submit" :label="t('leagues.onboardJoin')" :loading="join.isPending.value" :disabled="!code.trim()" />
    </form>
    <Message v-if="error" severity="error" size="small" variant="simple" class="mt-2">{{ error }}</Message>
    <div class="flex flex-wrap items-center justify-between gap-2 mt-5">
      <div class="flex gap-2">
        <Button :label="t('leagues.onboardCreate')" severity="secondary" outlined size="small" @click="goCreate" />
        <Button :label="t('leagues.onboardBrowse')" severity="secondary" outlined size="small" @click="goBrowse" />
      </div>
      <Button :label="t('leagues.onboardSkip')" text size="small" @click="dismiss" />
    </div>
  </Dialog>
</template>
