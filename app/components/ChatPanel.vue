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
const { enabled, isAdmin, ready, loading, sending, messages, memberKeys, identityStatus } = chat
const { identity, hasRecovery, setupRecovery, restore } = useChatIdentity()

// Key verification: per-member safety numbers + trust-on-first-use pinning, so a
// substituted public key is caught.
const verify = useChatKeyVerification(memberKeys, computed(() => identity.value?.publicKey ?? null))
const { entries: keyEntries, myFingerprint, changedCount } = verify
const showVerify = ref(false)
// Show peers only; the caller's own number is shown once as "your safety number".
const peerEntries = computed(() => keyEntries.value.filter((e) => e.userId !== meId.value))

// Member names for display (the messages carry only user ids). Reuses the shared
// league-detail query so we don't re-fetch the roster the page already cached.
const detail = useLeagueDetail(computed<string | null>(() => props.leagueId))
const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const m of detail.data.value?.members ?? []) map[m.userId] = m.name
  return map
})
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

// Key rotation (admins): a fresh key for current members, revoking anyone removed.
const showRotate = ref(false)
const rotating = ref(false)
async function confirmRotate() {
  rotating.value = true
  try {
    await chat.rotateKey()
    showRotate.value = false
  } finally {
    rotating.value = false
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
      <span v-if="changedCount > 0" v-tooltip.top="t('chat.verify.changedWarn')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)"><i class="pi pi-exclamation-triangle text-[10px]" />{{ t('chat.verify.changed') }}</span>
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

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100 inline-flex items-center gap-1" @click="showVerify = !showVerify">
              {{ t('chat.verify.show') }}
              <span v-if="changedCount > 0" style="color: var(--ng-danger)">({{ changedCount }})</span>
            </button>
            <button v-if="!hasRecovery" type="button" class="text-xs underline" style="color: var(--p-primary-color)" :disabled="recoveryBusy" @click="openRecoverySetup">{{ t('chat.setupRecovery') }}</button>
          </div>
          <div v-if="isAdmin" class="flex items-center gap-3">
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="showRotate = true">{{ t('chat.rotate.button') }}</button>
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="chat.disableChat()">{{ t('chat.disable') }}</button>
          </div>
        </div>

        <!-- Safety-number verification: compare these out-of-band to detect a swapped key. -->
        <div v-if="showVerify" class="flex flex-col gap-2 text-sm border-t pt-3" style="border-color: var(--p-content-border-color)">
          <p style="color: var(--p-text-muted-color)">{{ t('chat.verify.intro') }}</p>
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold">{{ t('chat.verify.your') }}</span>
            <code class="font-mono text-xs break-all">{{ myFingerprint }}</code>
          </div>
          <p v-if="!peerEntries.length" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.verify.empty') }}</p>
          <div v-for="e in peerEntries" :key="e.userId" class="flex flex-col gap-1 border-t pt-2" style="border-color: var(--p-content-border-color)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold">{{ nameFor(e.userId) }}</span>
              <span v-if="e.changed" class="text-[10px] px-1.5 py-0.5 rounded-full" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.verify.changed') }}</span>
              <span v-else-if="e.verified" class="text-[10px] px-1.5 py-0.5 rounded-full" style="background: var(--ng-star-soft); color: var(--ng-star)">{{ t('chat.verify.verified') }}</span>
            </div>
            <code class="font-mono text-xs break-all" :style="e.changed ? 'color: var(--ng-danger)' : ''">{{ e.fingerprint }}</code>
            <div class="flex items-center gap-3">
              <button v-if="e.changed" type="button" class="text-xs underline" style="color: var(--ng-danger)" @click="verify.acknowledgeChange(e.userId)">{{ t('chat.verify.acknowledge') }}</button>
              <button v-if="!e.verified" type="button" class="text-xs underline" style="color: var(--p-primary-color)" @click="verify.markVerified(e.userId)">{{ t('chat.verify.markVerified') }}</button>
            </div>
          </div>
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

    <!-- Rotate-key confirm (admins). -->
    <Dialog v-model:visible="showRotate" modal :header="t('chat.rotate.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <p class="text-sm">{{ t('chat.rotate.body') }}</p>
      <template #footer>
        <Button :label="t('chat.rotate.cancel')" severity="secondary" text @click="showRotate = false" />
        <Button :label="t('chat.rotate.confirm')" :loading="rotating" @click="confirmRotate" />
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
