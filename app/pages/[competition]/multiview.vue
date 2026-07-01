<script setup lang="ts">
import {
  MULTIVIEW_LAYOUTS,
  capacityOf,
  gridDims,
  parseMultiviewQuery,
  buildMultiviewQuery,
  visibleCells,
  resolveFocus,
  addCell,
  replaceCell,
  removeCell,
  type MultiviewLayout,
  type MultiviewState,
} from '../../utils/multiview'

const { t } = useI18n()
useHead({ title: t('multiview.title') })

const route = useRoute()
const router = useRouter()

// The URL query is the single source of truth: state is derived from it, and every
// change is written back with router.replace (no history spam), so a view is
// shareable and survives reload.
const state = computed<MultiviewState>(() => parseMultiviewQuery(route.query))
const layout = computed(() => state.value.layout)
const cells = computed(() => visibleCells(state.value.cells, state.value.layout))
const focus = computed(() => resolveFocus(state.value.cells, state.value.layout, state.value.focus))

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
function setFocus(id: string) {
  update({ focus: id })
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

// Per-cell Tile|Stream choice is ephemeral UI state (not in the URL), keyed by
// match id so it survives layout changes.
const viewModes = reactive<Record<string, 'tile' | 'stream'>>({})
function setViewMode(id: string, mode: 'tile' | 'stream') {
  viewModes[id] = mode
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

    <MultiviewGrid
      :cells="cells"
      :layout="layout"
      :focused-id="focus"
      :view-modes="viewModes"
      @add="openAdd"
      @replace="openReplace"
      @remove="onRemove"
      @focus="setFocus"
      @update:view-mode="setViewMode"
    />

    <MultiviewPickerDialog v-model:visible="pickerOpen" :disabled-ids="cells" @select="onSelect" />
  </div>
</template>
