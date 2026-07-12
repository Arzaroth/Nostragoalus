<script setup lang="ts">
import type { VoiceScope } from '#shared/types/voice'
import { voiceRoomKey } from '#shared/types/voice'

// The voice affordance in a chat header. For a DM it is a one-tap call button; for
// a league room it is a join button carrying the live "N in voice" badge. Hidden
// while this tab is already in this room's call (the in-call bar takes over).
const props = defineProps<{
  isDm: boolean
  threadId?: string
  calleeId?: string | null
  leagueId?: string
  matchId?: string | null
}>()

const { t } = useI18n()
const { inCall, isInScope, voiceCountFor, voiceNamesFor, startDmCall, joinLeagueVoice } = useVoiceCall()

const scope = computed<VoiceScope | null>(() => {
  if (props.isDm) return props.threadId ? { kind: 'dm', threadId: props.threadId } : null
  return props.leagueId ? { kind: 'league', leagueId: props.leagueId, matchId: props.matchId ?? null } : null
})

const here = computed(() => (scope.value ? isInScope(scope.value) : false))
const count = computed(() => (scope.value ? voiceCountFor(voiceRoomKey(scope.value)) : 0))
// League tooltip names who is already in the call, so the badge answers "who?".
const tooltip = computed(() => {
  if (props.isDm) return t('voice.call')
  const names = scope.value ? voiceNamesFor(voiceRoomKey(scope.value)) : []
  return names.length ? `${t('voice.joinVoice')} - ${names.join(', ')}` : t('voice.joinVoice')
})
// Busy elsewhere: a call is up but not for this room.
const busy = computed(() => inCall.value && !here.value)
const canCall = computed(() => (props.isDm ? !!props.threadId && !!props.calleeId : !!props.leagueId))

function act(): void {
  if (busy.value || !scope.value) return
  if (props.isDm && props.threadId && props.calleeId) startDmCall(props.threadId, props.calleeId)
  else if (!props.isDm && props.leagueId) joinLeagueVoice(props.leagueId, props.matchId ?? null)
}
</script>

<template>
  <button
    v-if="canCall && !here"
    type="button"
    v-tooltip.top="tooltip"
    class="relative inline-flex items-center opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
    :class="count > 0 ? 'opacity-100' : ''"
    :style="count > 0 ? 'color: var(--p-primary-color)' : ''"
    :disabled="busy"
    :aria-label="isDm ? t('voice.call') : t('voice.joinVoice')"
    @click="act"
  >
    <i class="pi pi-phone" />
    <span
      v-if="!isDm && count > 0"
      class="absolute -top-1.5 -end-1.5 min-w-[1rem] h-4 px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
    >{{ count }}</span>
  </button>
</template>
