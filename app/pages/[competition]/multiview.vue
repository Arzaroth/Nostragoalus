<script setup lang="ts">
import {
  MULTIVIEW_LAYOUTS,
  capacityOf,
  gridDims,
  parseMultiviewQuery,
  buildMultiviewQuery,
  visibleCells,
  addCell,
  replaceCell,
  removeCell,
  type MultiviewLayout,
  type MultiviewState,
} from '../../utils/multiview'
import type { MatchListItem } from '../../composables/useMatches'

const { t } = useI18n()
useHead({ title: t('multiview.title') })

const route = useRoute()
const router = useRouter()
const { data: allMatches } = useMatches()
const matchById = computed(() => {
  const map = new Map<string, MatchListItem>()
  for (const m of allMatches.value ?? []) map.set(m.id, m)
  return map
})

// The URL query is the single source of truth: state is derived from it, and every
// change is written back with router.replace (no history spam), so a view is
// shareable and survives reload.
const state = computed<MultiviewState>(() => parseMultiviewQuery(route.query))
const layout = computed(() => state.value.layout)
const cells = computed(() => visibleCells(state.value.cells, state.value.layout))
// One entry per rendered grid slot (filled or empty), resolved against the match
// list so the cell can show teams/score without another fetch.
const slots = computed(() =>
  Array.from({ length: capacityOf(state.value.layout) }, (_, index) => {
    const id = cells.value[index]
    return { index, id, match: id ? matchById.value.get(id) : undefined }
  }),
)

function update(next: Partial<MultiviewState>) {
  const q = { ...route.query }
  delete q.cells
  delete q.layout
  delete q.focus
  void router.replace({ query: { ...q, ...buildMultiviewQuery({ ...state.value, ...next }) } })
}
function setLayout(l: MultiviewLayout) {
  update({ layout: l })
}

// picker: null index = append a cell, a number = replace that cell in place.
const pickerOpen = ref(false)
const pickerIndex = ref<number | null>(null)
function openAdd() {
  pickerIndex.value = null
  pickerOpen.value = true
}
function openReplace(i: number) {
  pickerIndex.value = i
  pickerOpen.value = true
}
function onSelect(id: string) {
  update({ cells: pickerIndex.value === null ? addCell(state.value.cells, id, state.value.layout) : replaceCell(state.value.cells, pickerIndex.value, id) })
}
function onRemove(i: number) {
  update({ cells: removeCell(state.value.cells, i) })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <CompetitionPill />
        <div>
          <h1 class="text-lg font-semibold leading-tight">{{ t('multiview.title') }}</h1>
          <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('multiview.subtitle') }}</p>
        </div>
      </div>
      <div class="inline-flex rounded-lg border overflow-hidden" style="border-color: var(--p-content-border-color)">
        <button
          v-for="l in MULTIVIEW_LAYOUTS"
          :key="l"
          type="button"
          class="px-2.5 py-1.5 transition"
          :class="l === layout ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'"
          :style="l === layout ? 'background: var(--p-primary-color)' : ''"
          :aria-label="t('multiview.layoutAria', { layout: l })"
          v-tooltip.bottom="t('multiview.layoutAria', { layout: l })"
          @click="setLayout(l)"
        >
          <span class="grid gap-0.5" :style="{ gridTemplateColumns: `repeat(${gridDims(l).cols}, 0.4rem)` }">
            <span v-for="n in capacityOf(l)" :key="n" class="rounded-[1px]" style="width: 0.4rem; height: 0.4rem; background: currentColor" />
          </span>
        </button>
      </div>
    </div>

    <div
      class="grid gap-2 md:gap-3"
      :style="{
        gridTemplateColumns: `repeat(${gridDims(layout).cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridDims(layout).rows}, minmax(0, 1fr))`,
        minHeight: 'calc(100dvh - var(--ng-header-h) - 9rem)',
      }"
    >
      <template v-for="slot in slots" :key="slot.index">
        <MultiviewSlotEmpty v-if="!slot.id" @add="openAdd" />
        <div
          v-else
          class="relative flex flex-col rounded-xl border overflow-hidden"
          style="border-color: var(--p-content-border-color); background: var(--p-content-background)"
        >
          <div class="flex items-center justify-between gap-2 px-2 py-1.5 border-b" style="border-color: var(--p-content-border-color)">
            <span class="flex items-center gap-1.5 min-w-0 text-sm font-medium">
              <template v-if="slot.match">
                <img v-if="flagUrl(slot.match.homeTeamCode)" :src="flagUrl(slot.match.homeTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
                <span class="truncate">{{ slot.match.homeTeam }}</span>
                <span class="opacity-50 shrink-0">-</span>
                <span class="truncate">{{ slot.match.awayTeam }}</span>
                <img v-if="flagUrl(slot.match.awayTeamCode)" :src="flagUrl(slot.match.awayTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
              </template>
              <span v-else class="truncate opacity-60">{{ t('matches.noResults') }}</span>
            </span>
            <span class="flex items-center gap-1 shrink-0">
              <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.changeMatch')" v-tooltip.bottom="t('multiview.changeMatch')" @click="openReplace(slot.index)">
                <i class="pi pi-sync text-xs" />
              </button>
              <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.remove')" v-tooltip.bottom="t('multiview.remove')" @click="onRemove(slot.index)">
                <i class="pi pi-times text-xs" />
              </button>
            </span>
          </div>
          <div class="flex-1 flex items-center justify-center p-4">
            <span v-if="slot.match" class="tabular-nums text-3xl font-bold">
              {{ slot.match.fullTimeHome ?? '-' }} <span class="opacity-40">–</span> {{ slot.match.fullTimeAway ?? '-' }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <MultiviewPickerDialog v-model:visible="pickerOpen" :disabled-ids="cells" @select="onSelect" />
  </div>
</template>
