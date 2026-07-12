<script setup lang="ts">
// The always-mounted voice UI (one per tab, in the default layout): the incoming
// ring, the in-call bar, the hidden remote-audio elements and the league invite
// picker. Client-only (.client) because it drives WebRTC / getUserMedia - never
// wrap it in <ClientOnly>. All call state comes from the useVoiceCall singleton.
const { t } = useI18n()
const toast = useToast()
const { state, activeScope, roster, rosterNames, remoteStreams, incoming, muted, errorKey, accept, decline, hangup, invite, toggleMute } =
  useVoiceCall()

// Names come from the league roster when available (fresher on a rename), else
// from the names the server ships with each voice:roster push (covers DMs).
const leagueId = computed(() => (activeScope.value?.kind === 'league' ? activeScope.value.leagueId : null))
const detail = useLeagueDetail(leagueId)
const nameOf = (userId: string): string =>
  detail.data.value?.members?.find((m) => m.userId === userId)?.name ?? rosterNames.value[userId] ?? userId

// Who else is on the call, for the "with X, Y" line under the status.
const { session } = useAuth()
const myId = computed(() => session.value?.data?.user?.id ?? null)
const others = computed(() => roster.value.filter((id) => id !== myId.value))
const participantsLabel = computed(() =>
  state.value === 'in-call' && others.value.length ? others.value.map(nameOf).join(', ') : '',
)

const remoteEntries = computed(() => Object.entries(remoteStreams.value))
const isLeague = computed(() => activeScope.value?.kind === 'league')

// Call timer: start counting when the call connects.
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
watch(
  () => state.value,
  (s) => {
    if (s === 'in-call' && !timer) {
      elapsed.value = 0
      timer = setInterval(() => (elapsed.value += 1), 1000)
    } else if (s === 'idle') {
      clearInterval(timer)
      timer = undefined
      elapsed.value = 0
    }
  },
)
onBeforeUnmount(() => clearInterval(timer))
const clock = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = elapsed.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

// A denied mic (or other error) surfaces as a toast, once per error.
watch(
  () => errorKey.value,
  (key) => {
    if (key) toast.add({ severity: 'error', summary: t(key), life: 4000 })
  },
)

const statusLabel = computed(() => {
  switch (state.value) {
    case 'outgoing':
      return t('voice.ringing')
    case 'connecting':
      return t('voice.connecting')
    case 'in-call':
      return isLeague.value ? t('voice.inVoice', { n: roster.value.length }) : clock.value
    default:
      return ''
  }
})

// Invite picker (league only): members not already in the room.
const showInvite = ref(false)
const invitable = computed(() =>
  (detail.data.value?.members ?? []).filter((m) => !roster.value.includes(m.userId)),
)
function ring(userId: string): void {
  invite([userId])
  toast.add({ severity: 'info', summary: t('voice.invited', { name: nameOf(userId) }), life: 2500 })
}
</script>

<template>
  <div>
    <!-- Hidden remote audio, one element per connected peer. -->
    <VoiceAudio v-for="[peerId, stream] in remoteEntries" :key="peerId" :stream="stream" />

    <!-- Incoming ring. -->
    <Dialog
      :visible="state === 'incoming' && !!incoming"
      modal
      :closable="false"
      :header="t('voice.incoming')"
      :style="{ width: '22rem', maxWidth: '92vw' }"
    >
      <div class="flex flex-col items-center gap-3 py-2">
        <span class="relative flex h-14 w-14 items-center justify-center rounded-full" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">
          <i class="pi pi-phone text-2xl" />
        </span>
        <p class="text-center">{{ t('voice.callingYou', { name: incoming?.fromName ?? '' }) }}</p>
      </div>
      <template #footer>
        <div class="flex justify-center gap-3 w-full">
          <Button :label="t('voice.decline')" icon="pi pi-times" severity="danger" outlined @click="decline" />
          <Button :label="t('voice.accept')" icon="pi pi-check" @click="accept" />
        </div>
      </template>
    </Dialog>

    <!-- In-call / outgoing bar, pinned above the chat dock. -->
    <div
      v-if="state === 'outgoing' || state === 'connecting' || state === 'in-call'"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
    >
      <span class="relative flex h-2.5 w-2.5">
        <span class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style="background: var(--p-primary-color)" />
        <span class="relative inline-flex rounded-full h-2.5 w-2.5" style="background: var(--p-primary-color)" />
      </span>
      <span class="flex flex-col min-w-0">
        <span class="text-sm font-medium tabular-nums">{{ statusLabel }}</span>
        <span
          v-if="participantsLabel"
          class="text-xs truncate max-w-[14rem]"
          style="color: var(--p-text-muted-color)"
        >{{ participantsLabel }}</span>
      </span>

      <button
        v-if="state === 'in-call'"
        type="button"
        v-tooltip.top="muted ? t('voice.unmute') : t('voice.mute')"
        class="inline-flex items-center opacity-80 hover:opacity-100"
        :style="muted ? 'color: var(--ng-danger)' : ''"
        :aria-label="muted ? t('voice.unmute') : t('voice.mute')"
        @click="toggleMute"
      >
        <i :class="muted ? 'pi pi-microphone-slash' : 'pi pi-microphone'" />
      </button>

      <button
        v-if="isLeague && state === 'in-call'"
        type="button"
        v-tooltip.top="t('voice.invite')"
        class="inline-flex items-center opacity-80 hover:opacity-100"
        :aria-label="t('voice.invite')"
        @click="showInvite = true"
      >
        <i class="pi pi-user-plus" />
      </button>

      <button
        type="button"
        v-tooltip.top="t('voice.hangup')"
        class="inline-flex items-center justify-center h-7 w-7 rounded-full text-white"
        style="background: var(--ng-danger)"
        :aria-label="t('voice.hangup')"
        @click="hangup"
      >
        <i class="pi pi-phone" style="transform: rotate(135deg)" />
      </button>
    </div>

    <!-- League invite picker. -->
    <Dialog v-model:visible="showInvite" modal :header="t('voice.inviteTitle')" :style="{ width: '24rem', maxWidth: '92vw' }">
      <div v-if="invitable.length" class="flex flex-col gap-1">
        <button
          v-for="m in invitable"
          :key="m.userId"
          type="button"
          class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-start hover:opacity-100 opacity-90"
          style="background: transparent"
          @click="ring(m.userId)"
        >
          <UserAvatar :user-id="m.userId" :image="m.image" size="normal" />
          <span class="flex-1 truncate text-sm">{{ m.name }}</span>
          <i class="pi pi-phone text-xs" style="color: var(--p-primary-color)" />
        </button>
      </div>
      <p v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('voice.inviteNone') }}</p>
    </Dialog>
  </div>
</template>
