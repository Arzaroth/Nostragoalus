<script setup lang="ts">
import {
  MULTIVIEW_LAYOUTS,
  capacityOf,
  gridDims,
  parseMultiviewQuery,
  buildMultiviewQuery,
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
      <div
        v-for="i in capacityOf(layout)"
        :key="i"
        class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition hover:bg-black/5 dark:hover:bg-white/5"
        style="border-color: var(--p-content-border-color)"
      >
        <i class="pi pi-plus text-2xl opacity-70" />
        <span class="mt-2 text-sm" style="color: var(--p-text-muted-color)">{{ t('multiview.addMatch') }}</span>
      </div>
    </div>
  </div>
</template>
