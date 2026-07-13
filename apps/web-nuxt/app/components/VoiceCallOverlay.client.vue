<script setup lang="ts">
// The always-mounted voice UI (one per tab, in the default layout): the incoming
// ring, the in-call bar, the hidden remote-audio elements and the league invite
// picker. Client-only (.client) because it drives WebRTC / getUserMedia - never
// wrap it in <ClientOnly>. All call state comes from the useVoiceCall singleton.
const { t } = useI18n()
const toast = useToast()
const {
  state, activeScope, roster, rosterNames, remoteStreams, incoming, muted, errorKey,
  localLevel, speakingPeers, mutedTalkingAt, connectionQuality, reconnecting,
  inputDevices, outputDevices, inputDeviceId, outputDeviceId, noiseSuppression, canPickOutput,
  accept, decline, hangup, invite, toggleMute,
  refreshDevices, setInputDevice, setOutputDevice, setNoiseSuppression,
} = useVoiceCall()

// Names come from the league roster when available (fresher on a rename), else
// from the names the server ships with each voice:roster push (covers DMs).
const leagueId = computed(() => (activeScope.value?.kind === 'league' ? activeScope.value.leagueId : null))
const detail = useLeagueDetail(leagueId)
const nameOf = (userId: string): string =>
  detail.data.value?.members?.find((m) => m.userId === userId)?.name ?? rosterNames.value[userId] ?? userId

// Who else is on the call, for the "with X, Y" line under the status. A speaking
// participant's name lights up (fed by the per-peer level meters).
const { session } = useAuth()
const myId = computed(() => session.value?.data?.user?.id ?? null)
const others = computed(() => (state.value === 'in-call' ? roster.value.filter((id) => id !== myId.value) : []))

// Own mic meter: a mini waveform whose bar heights follow the RMS level
// continuously (meterBarHeights), smoothed by a CSS height transition.
const meterHeights = computed(() => meterBarHeights(localLevel.value, muted.value))

const remoteEntries = computed(() => Object.entries(remoteStreams.value))
const isLeague = computed(() => activeScope.value?.kind === 'league')

// Call timer: derived from a wall-clock start (a per-tick counter drifts far
// behind real time under background-tab interval throttling). Immediate so a
// remount mid-call starts the clock instead of freezing at 0:00.
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let startedAt = 0
watch(
  () => state.value,
  (s) => {
    if (s === 'in-call' && !timer) {
      startedAt = Date.now()
      elapsed.value = 0
      timer = setInterval(() => (elapsed.value = Math.round((Date.now() - startedAt) / 1000)), 1000)
    } else if (s === 'idle') {
      clearInterval(timer)
      timer = undefined
      elapsed.value = 0
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))
const clock = computed(() => formatCallDuration(elapsed.value))

// A denied mic (or other error) surfaces as a toast, once per error.
watch(
  () => errorKey.value,
  (key) => {
    if (key) toast.add({ severity: 'error', summary: t(key), life: 4000 })
  },
)

// Talking while muted: nudge, throttled composable-side.
watch(
  () => mutedTalkingAt.value,
  (at) => {
    if (at) toast.add({ severity: 'warn', summary: t('voice.mutedTalking'), life: 3000 })
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

// Audio settings dialog: device pickers + noise suppression. Options are built
// with a "system default" first; unnamed devices fall back to a generic label.
const showSettings = ref(false)
watch(showSettings, (open) => {
  if (open) void refreshDevices()
})
const deviceOptions = (devices: readonly { deviceId: string; label: string }[], fallback: string) => [
  { label: t('voice.deviceDefault'), value: null as string | null },
  ...devices.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({
    label: d.label || `${fallback} ${i + 1}`,
    value: d.deviceId as string | null,
  })),
]
const inputOptions = computed(() => deviceOptions(inputDevices.value, t('voice.input')))
const outputOptions = computed(() => deviceOptions(outputDevices.value, t('voice.output')))
const nsModel = computed({
  get: () => noiseSuppression.value,
  set: (on: boolean) => void setNoiseSuppression(on),
})
const inputModel = computed({
  get: () => inputDeviceId.value,
  set: (id: string | null) => void setInputDevice(id),
})
const outputModel = computed({
  get: () => outputDeviceId.value,
  set: (id: string | null) => setOutputDevice(id),
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
    <VoiceAudio v-for="[peerId, stream] in remoteEntries" :key="peerId" :stream="stream" :sink-id="outputDeviceId" />

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
        <span class="text-sm font-medium tabular-nums">
          {{ statusLabel }}
          <span v-if="reconnecting" class="text-xs font-semibold" style="color: var(--ng-danger)">{{ t('voice.reconnecting') }}</span>
        </span>
        <span v-if="others.length" class="text-xs truncate max-w-[14rem]">
          <template v-for="(o, i) in others" :key="o">
            <!-- Speaking is signaled by color only: a weight change alters the
                 text width and shifts the whole bar on every utterance. -->
            <span
              :style="{
                color: speakingPeers[o] ? 'var(--p-primary-color)' : 'var(--p-text-muted-color)',
                transition: 'color 150ms ease',
              }"
            >{{ nameOf(o) }}</span><span v-if="i < others.length - 1" style="color: var(--p-text-muted-color)">, </span>
          </template>
        </span>
      </span>

      <!-- Link quality warning; hidden while the connection is fine. -->
      <i
        v-if="state === 'in-call' && !reconnecting && connectionQuality && connectionQuality !== 'good'"
        v-tooltip.top="t(`voice.quality.${connectionQuality}`)"
        class="pi pi-wifi text-sm"
        :style="connectionQuality === 'poor' ? 'color: var(--ng-danger)' : 'color: var(--ng-star)'"
        :aria-label="t(`voice.quality.${connectionQuality}`)"
        role="img"
      />

      <!-- Own mic meter: a live waveform, greyed flat while muted. -->
      <span v-if="state === 'in-call'" class="flex items-center gap-0.5 h-3.5" aria-hidden="true">
        <span
          v-for="(h, i) in meterHeights"
          :key="i"
          class="w-1 rounded-sm"
          :style="{
            height: `${h}px`,
            background: muted ? 'var(--p-content-border-color)' : 'var(--p-primary-color)',
            transition: 'height 120ms ease-out',
          }"
        />
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
        <!-- primeicons has no microphone-slash glyph (an unknown class renders an
             empty, unclickable icon), so muted = the mic icon plus a strike. -->
        <span class="relative inline-flex">
          <i class="pi pi-microphone" />
          <span
            v-if="muted"
            class="absolute left-1/2 top-1/2 w-[2px] h-[1.35em] rounded-full"
            style="background: currentColor; transform: translate(-50%, -50%) rotate(45deg)"
          />
        </span>
      </button>

      <button
        v-if="state === 'in-call'"
        type="button"
        v-tooltip.top="t('voice.settings')"
        class="inline-flex items-center opacity-80 hover:opacity-100"
        :aria-label="t('voice.settings')"
        @click="showSettings = true"
      >
        <i class="pi pi-cog" />
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

    <!-- Audio settings. -->
    <Dialog v-model:visible="showSettings" modal :header="t('voice.settings')" :style="{ width: '24rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-1 text-sm">
          {{ t('voice.input') }}
          <Select v-model="inputModel" :options="inputOptions" option-label="label" option-value="value" class="w-full" />
        </label>
        <label v-if="canPickOutput" class="flex flex-col gap-1 text-sm">
          {{ t('voice.output') }}
          <Select v-model="outputModel" :options="outputOptions" option-label="label" option-value="value" class="w-full" />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <ToggleSwitch v-model="nsModel" />
          {{ t('voice.noiseSuppression') }}
        </label>
      </div>
    </Dialog>

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
