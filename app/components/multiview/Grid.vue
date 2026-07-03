<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { capacityOf, gridDims, canEnableStream, type MultiviewLayout } from '../../utils/multiview'
import type { MatchListItem } from '../../composables/useMatches'

const props = withDefaults(
  defineProps<{ cells: string[]; layout: MultiviewLayout; focusedId: string | null; viewModes?: Record<string, 'tile' | 'stream'> }>(),
  { viewModes: () => ({}) },
)
const emit = defineEmits<{ add: []; replace: [number]; remove: [number]; focus: [string]; 'update:viewMode': [string, 'tile' | 'stream'] }>()

// Cells currently in stream mode, and whether another cell may switch to stream
// under the concurrent-stream cap.
const streamIds = computed(() => props.cells.filter((id) => props.viewModes[id] === 'stream'))

const qc = useQueryClient()
const { data: allMatches } = useMatches()
const matchById = computed(() => {
  const map = new Map<string, MatchListItem>()
  for (const m of allMatches.value ?? []) map.set(m.id, m)
  return map
})

// The one live subscription for the whole grid: subscribe only the cell matches
// over the shared socket (it patches the ['matches', slug] cache the tiles read).
const cellMatches = computed<MatchListItem[]>(() => props.cells.map((id) => matchById.value.get(id)).filter((m): m is MatchListItem => !!m))
useLiveMatches(cellMatches, () => {
  // The patcher only moves the list score/status; refresh the richer per-cell
  // detail, and the timeline for whichever cell is focused.
  for (const id of props.cells) qc.invalidateQueries({ queryKey: ['match-live-detail', id] })
  if (props.focusedId) qc.invalidateQueries({ queryKey: ['match-timeline', props.focusedId] })
})

const slots = computed(() =>
  Array.from({ length: capacityOf(props.layout) }, (_, index) => {
    const id = props.cells[index]
    return { index, id, match: id ? matchById.value.get(id) : undefined }
  }),
)
</script>

<template>
  <div
    class="grid gap-2 md:gap-3"
    :style="{
      gridTemplateColumns: `repeat(${gridDims(layout).cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${gridDims(layout).rows}, minmax(0, 1fr))`,
      // A definite height (not min-height) so each cell's row is bounded: a cell's
      // play-by-play then scrolls inside it (max-h-full) instead of growing the
      // cell and pushing the page into a scrollbar. The header/footer vars carry
      // fallbacks (their natural sizes) so the calc stays VALID before the
      // ResizeObservers set them: an unset var with no fallback voids the whole
      // calc, collapsing height to auto and unbounding the grid.
      height: 'calc(100dvh - var(--ng-header-h, 4rem) - var(--ng-footer-h, 2.25rem) - 9rem)',
    }"
  >
    <template v-for="slot in slots" :key="slot.id ?? 'empty-' + slot.index">
      <MultiviewSlotEmpty v-if="!slot.id" @add="emit('add')" />
      <MultiviewCell
        v-else
        :match-id="slot.id"
        :match="slot.match"
        :focused="slot.id === focusedId"
        :view-mode="viewModes[slot.id] ?? 'tile'"
        :stream-allowed="canEnableStream(streamIds, slot.id)"
        @change="emit('replace', slot.index)"
        @remove="emit('remove', slot.index)"
        @focus="emit('focus', slot.id)"
        @update:view-mode="(m) => emit('update:viewMode', slot.id!, m)"
      />
    </template>
  </div>
</template>
