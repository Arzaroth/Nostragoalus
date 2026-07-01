<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { capacityOf, gridDims, type MultiviewLayout } from '../../utils/multiview'
import type { MatchListItem } from '../../composables/useMatches'

const props = defineProps<{ cells: string[]; layout: MultiviewLayout; focusedId: string | null }>()
const emit = defineEmits<{ add: []; replace: [number]; remove: [number]; focus: [string] }>()

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
      minHeight: 'calc(100dvh - var(--ng-header-h) - 9rem)',
    }"
  >
    <template v-for="slot in slots" :key="slot.index">
      <MultiviewSlotEmpty v-if="!slot.id" @add="emit('add')" />
      <MultiviewCell
        v-else
        :match-id="slot.id"
        :match="slot.match"
        :focused="slot.id === focusedId"
        @change="emit('replace', slot.index)"
        @remove="emit('remove', slot.index)"
        @focus="emit('focus', slot.id)"
      />
    </template>
  </div>
</template>
