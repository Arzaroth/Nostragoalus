<script setup lang="ts">
// Owner-only line under "your pick": when one of the user's earlier (swapped-off)
// score picks would have out-scored the one they kept, surface it. The page only
// mounts this for the owner of the pick once the match has started; the endpoint
// re-checks ownership. While live the result is provisional and tracks the same
// score signal the rest of the page does (liveKey), so it updates as goals land.
const props = defineProps<{ matchId: string; started: boolean; live: boolean; liveKey: number | null }>()
const { t } = useI18n()

const id = computed(() => props.matchId)
const started = computed(() => props.started)
const { data, refetch } = useMyPastPicks(id, started)

// The live counterfactual is volatile (it can flip as the score moves) and
// resolves to the full-time line at the final whistle. Re-run it whenever the
// live score or the in-play flag changes.
watch(
  () => [props.liveKey, props.live] as const,
  () => {
    if (props.started) refetch()
  },
)

const cf = computed(() => data.value ?? null)
const show = computed(() => !!cf.value && cf.value.scope !== 'none' && !!cf.value.earlier)
const isLive = computed(() => cf.value?.scope === 'live')
const messageKey = computed(() => {
  if (!cf.value) return ''
  if (cf.value.cheeky) return isLive.value ? 'pastPick.liveCheeky' : 'pastPick.finalCheeky'
  return isLive.value ? 'pastPick.live' : 'pastPick.final'
})
const score = computed(() => (cf.value?.earlier ? `${cf.value.earlier.home}–${cf.value.earlier.away}` : ''))
</script>

<template>
  <div
    v-if="show"
    class="flex items-center justify-center gap-1.5 text-xs text-center max-w-xs"
    :style="`color: ${isLive ? 'var(--ng-danger)' : 'var(--p-text-muted-color)'}`"
  >
    <span v-if="isLive" class="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style="background: var(--ng-danger)" />
    <span v-else class="shrink-0">⏪</span>
    <span>{{ t(messageKey, { score }) }}</span>
  </div>
</template>
