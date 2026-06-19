<script setup lang="ts">
// End-to-end encrypted league chat. The league-global room (matchId null) or a
// per-match thread. All crypto is client-side; the server only relays ciphertext.
const props = withDefaults(defineProps<{ leagueId: string; matchId?: string | null }>(), { matchId: null })

const { t } = useI18n()
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id ?? null)

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const chat = useLeagueChat(
  () => props.leagueId,
  () => props.matchId ?? null,
)
const { enabled, isAdmin, ready, loading, sending, messages, identityStatus } = chat
const { hasRecovery, setupRecovery, restore } = useChatIdentity()

// Member names for display (the messages carry only user ids).
const names = ref<Record<string, string>>({})
async function loadNames() {
  try {
    const r = await $fetch<{ members: { userId: string; name: string }[] }>(`/api/leagues/${props.leagueId}`)
    const map: Record<string, string> = {}
    for (const m of r.members) map[m.userId] = m.name
    names.value = map
  } catch {
    // names are best-effort
  }
}
watch(() => props.leagueId, loadNames, { immediate: true })
function nameFor(uid: string | null): string {
  if (!uid) return t('chat.unknownUser')
  return names.value[uid] ?? t('chat.unknownUser')
}

const draft = ref('')
async function submit() {
  const text = draft.value
  draft.value = ''
  await chat.send(text)
}

// Enable flow (admins), behind the legal-cover warning.
const showWarning = ref(false)
const enabling = ref(false)
async function confirmEnable() {
  enabling.value = true
  try {
    await chat.enableChat()
    showWarning.value = false
    if (!hasRecovery.value) await openRecoverySetup()
  } finally {
    enabling.value = false
  }
}

// Recovery code (shown once).
const recoveryCode = ref<string | null>(null)
const showRecovery = ref(false)
const recoveryBusy = ref(false)
async function openRecoverySetup() {
  recoveryBusy.value = true
  try {
    recoveryCode.value = await setupRecovery()
    showRecovery.value = true
  } finally {
    recoveryBusy.value = false
  }
}
async function copyRecovery() {
  if (recoveryCode.value) await navigator.clipboard?.writeText(recoveryCode.value).catch(() => {})
}

// Restore on a new device.
const restoreCode = ref('')
const restoreError = ref(false)
const restoring = ref(false)
async function doRestore() {
  restoring.value = true
  restoreError.value = false
  try {
    await restore(restoreCode.value)
    await chat.load()
  } catch {
    restoreError.value = true
  } finally {
    restoring.value = false
  }
}

const listEl = ref<HTMLElement | null>(null)
watch(
  messages,
  () =>
    nextTick(() => {
      if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
    }),
  { deep: true },
)
</script>

<template>
  <div class="ng-card rounded-2xl border p-4 flex flex-col gap-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
    <div class="flex items-center gap-2">
      <i class="pi pi-lock" style="color: var(--p-primary-color)" />
      <span class="font-semibold">{{ props.matchId ? t('chat.threadTitle') : t('chat.roomTitle') }}</span>
      <span v-tooltip.top="t('chat.e2eeHint')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full" style="background: var(--ng-star-soft); color: var(--ng-star)">{{ t('chat.e2ee') }}</span>
    </div>

    <!-- This device has no key for an existing identity: restore. -->
    <div v-if="identityStatus === 'needs-restore'" class="flex flex-col gap-2 text-sm">
      <p style="color: var(--p-text-muted-color)">{{ t('chat.restore.body') }}</p>
      <InputText v-model="restoreCode" :placeholder="t('chat.restore.placeholder')" />
      <small v-if="restoreError" style="color: var(--ng-danger)">{{ t('chat.restore.error') }}</small>
      <Button :label="t('chat.restore.button')" :loading="restoring" size="small" @click="doRestore" />
    </div>

    <!-- Disabled. -->
    <div v-else-if="!enabled" class="text-sm flex flex-col gap-2" style="color: var(--p-text-muted-color)">
      <p>{{ t('chat.off') }}</p>
      <Button v-if="isAdmin" :label="t('chat.enable')" icon="pi pi-comments" size="small" @click="showWarning = true" />
    </div>

    <!-- Enabled. -->
    <template v-else>
      <div v-if="loading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.loading') }}</div>
      <div v-else-if="!ready" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.settingUp') }}</div>
      <template v-else>
        <div ref="listEl" class="flex flex-col gap-2 overflow-y-auto" style="max-height: 22rem">
          <p v-if="!messages.length" class="text-sm py-6 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.empty') }}</p>
          <div v-for="m in messages" :key="m.id" class="text-sm flex flex-col">
            <div class="flex items-baseline gap-2">
              <span class="font-semibold" :style="m.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(m.userId) }}</span>
              <span class="text-[10px]" style="color: var(--p-text-muted-color)">{{ fmtTime(m.createdAt) }}</span>
              <button v-if="m.userId && m.userId !== meId" type="button" class="text-[10px] underline opacity-60 hover:opacity-100" @click="chat.toggleMute(m.userId)">{{ t('chat.mute') }}</button>
            </div>
            <span v-if="m.text !== null" class="break-words">{{ m.text }}</span>
            <span v-else class="italic" style="color: var(--p-text-muted-color)">{{ t('chat.cantDecrypt') }}</span>
          </div>
        </div>

        <form class="flex items-end gap-2" @submit.prevent="submit">
          <Textarea v-model="draft" :placeholder="t('chat.placeholder')" rows="1" autoResize class="flex-1" @keydown.enter.exact.prevent="submit" />
          <Button type="submit" icon="pi pi-send" :loading="sending" :disabled="!draft.trim()" :aria-label="t('chat.send')" />
        </form>

        <div class="flex items-center justify-between">
          <button v-if="!hasRecovery" type="button" class="text-xs underline" style="color: var(--p-primary-color)" :disabled="recoveryBusy" @click="openRecoverySetup">{{ t('chat.setupRecovery') }}</button>
          <span v-else />
          <button v-if="isAdmin" type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="chat.disableChat()">{{ t('chat.disable') }}</button>
        </div>
      </template>
    </template>

    <!-- Legal-cover warning before enabling. -->
    <Dialog v-model:visible="showWarning" modal :header="t('chat.warning.title')" :style="{ width: '32rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-3 text-sm">
        <p>{{ t('chat.warning.body1') }}</p>
        <p>{{ t('chat.warning.body2') }}</p>
        <p style="color: var(--ng-danger)">{{ t('chat.warning.body3') }}</p>
      </div>
      <template #footer>
        <Button :label="t('chat.warning.cancel')" severity="secondary" text @click="showWarning = false" />
        <Button :label="t('chat.warning.confirm')" :loading="enabling" @click="confirmEnable" />
      </template>
    </Dialog>

    <!-- Recovery code, shown once. -->
    <Dialog v-model:visible="showRecovery" modal :header="t('chat.recovery.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-3 text-sm">
        <p>{{ t('chat.recovery.body') }}</p>
        <code class="block p-3 rounded-lg text-center font-mono break-all" style="background: var(--p-content-background); border: 1px solid var(--p-content-border-color)">{{ recoveryCode }}</code>
        <Button :label="t('chat.recovery.copy')" icon="pi pi-copy" severity="secondary" size="small" @click="copyRecovery" />
      </div>
      <template #footer>
        <Button :label="t('chat.recovery.saved')" @click="showRecovery = false" />
      </template>
    </Dialog>
  </div>
</template>
