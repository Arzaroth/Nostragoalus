<script setup lang="ts">
import { visibleMediaForStatus, type MatchMediaItem } from '#shared/match-media'
import { MAX_STREAM_CELLS } from '../../utils/multiview'
import type { MatchStatus } from '#shared/types/match'
import type { MatchListItem } from '../../composables/useMatches'

const props = withDefaults(
  defineProps<{
    matchId: string
    match?: MatchListItem
    focused?: boolean
    viewMode?: 'tile' | 'stream'
    streamAllowed?: boolean
  }>(),
  { viewMode: 'tile', streamAllowed: true },
)
const emit = defineEmits<{ change: []; remove: []; focus: []; 'update:viewMode': ['tile' | 'stream'] }>()
const { t } = useI18n()

const idRef = toRef(props, 'matchId')
const { data: media } = useMatchMedia(idRef)
// The first embeddable item visible for the current status (LIVE while playing,
// REPLAY/HIGHLIGHTS once finished).
const streamItem = computed<MatchMediaItem | null>(() => {
  const status = (props.match?.status ?? 'SCHEDULED') as MatchStatus
  return visibleMediaForStatus(media.value ?? [], status).find((m) => m.embeddable) ?? null
})
const hasStream = computed(() => !!streamItem.value)
const canStream = computed(() => hasStream.value && props.streamAllowed)
const showStream = computed(() => props.viewMode === 'stream' && hasStream.value)

// A stream cell that loses its embed (media pulled, or match state moved past it)
// falls back to the tile so the cell never goes blank.
watch(hasStream, (has) => {
  if (!has && props.viewMode === 'stream') emit('update:viewMode', 'tile')
})

const streamTooltip = computed(() => (!hasStream.value ? t('multiview.streamUnavailable') : !props.streamAllowed ? t('multiview.streamCapReached', { count: MAX_STREAM_CELLS }) : t('multiview.view.stream')))
</script>

<template>
  <div
    class="relative flex flex-col rounded-xl border overflow-hidden cursor-pointer transition"
    :style="`border-color: ${focused ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; background: var(--p-content-background); ${focused ? 'box-shadow: 0 0 0 1px var(--p-primary-color)' : ''}`"
    @click="$emit('focus')"
  >
    <div class="flex items-center justify-between gap-2 px-2 py-1.5 border-b" style="border-color: var(--p-content-border-color)">
      <span class="flex items-center gap-1.5 min-w-0 text-sm font-medium">
        <template v-if="match">
          <img v-if="flagUrl(match.homeTeamCode)" :src="flagUrl(match.homeTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span class="truncate">{{ match.homeTeam }}</span>
          <span class="opacity-50 shrink-0">-</span>
          <span class="truncate">{{ match.awayTeam }}</span>
          <img v-if="flagUrl(match.awayTeamCode)" :src="flagUrl(match.awayTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
        </template>
        <span v-else class="truncate opacity-60">{{ t('matches.noResults') }}</span>
      </span>
      <span class="flex items-center gap-1 shrink-0" @click.stop>
        <span class="inline-flex rounded-md border overflow-hidden text-xs" style="border-color: var(--p-content-border-color)">
          <button
            type="button"
            class="px-2 py-0.5 transition"
            :class="viewMode === 'tile' ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'"
            :style="viewMode === 'tile' ? 'background: var(--p-primary-color)' : ''"
            @click="$emit('update:viewMode', 'tile')"
          >
            {{ t('multiview.view.tile') }}
          </button>
          <button
            type="button"
            class="px-2 py-0.5 transition"
            :class="[viewMode === 'stream' ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/10', !canStream && viewMode !== 'stream' ? 'opacity-40 cursor-not-allowed' : '']"
            :style="viewMode === 'stream' ? 'background: var(--p-primary-color)' : ''"
            :disabled="!canStream && viewMode !== 'stream'"
            v-tooltip.bottom="streamTooltip"
            @click="canStream && $emit('update:viewMode', 'stream')"
          >
            {{ t('multiview.view.stream') }}
          </button>
        </span>
        <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.changeMatch')" v-tooltip.bottom="t('multiview.changeMatch')" @click="$emit('change')">
          <i class="pi pi-sync text-xs" />
        </button>
        <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.remove')" v-tooltip.bottom="t('multiview.remove')" @click="$emit('remove')">
          <i class="pi pi-times text-xs" />
        </button>
      </span>
    </div>
    <div class="flex-1 min-h-0 p-2">
      <MultiviewCellStream v-if="showStream" :item="streamItem" />
      <MultiviewCellTile v-else :match-id="matchId" :match="match" :focused="focused" />
    </div>
  </div>
</template>
