<script setup lang="ts">
import type { OddsTriple, StoredBookmakerOdds } from '#shared/types/odds'
import { oddsMovement, type OddsDirection } from '../utils/odds-movement'

const { t } = useI18n()
const props = defineProps<{
  odds:
    | (OddsTriple & {
        initial?: OddsTriple | null
        bookmakers?: StoredBookmakerOdds[] | null
      })
    | null
    | undefined
}>()

const fmt = (v: number) => v.toFixed(2)

// Current 1X2 paired with its opening-vs-current drift, for the inline row.
const outcomes = computed(() => {
  const o = props.odds
  if (!o) return []
  const mv = oddsMovement(o.initial, o)
  return [
    { code: '1', label: t('odds.home'), price: o.home, move: mv.home },
    { code: 'X', label: t('odds.draw'), price: o.draw, move: mv.draw },
    { code: '2', label: t('odds.away'), price: o.away, move: mv.away },
  ]
})

// Opening prices or a per-bookmaker list - anything worth expanding to.
const hasBreakdown = computed(
  () => !!props.odds && (!!props.odds.initial || (props.odds.bookmakers?.length ?? 0) > 0),
)

const expanded = ref(false)

const GLYPH: Record<OddsDirection, string> = { in: '▾', out: '▴', flat: '' }

function driftLabel(direction: OddsDirection, delta: number) {
  if (direction === 'in') return t('odds.shortened', { delta: Math.abs(delta).toFixed(2) })
  if (direction === 'out') return t('odds.drifted', { delta: Math.abs(delta).toFixed(2) })
  return t('odds.unchanged')
}

// A shortened price (money in) reads green, a drifting one red; the arrow and
// tooltip carry the meaning so the colour is only reinforcement.
function driftColor(direction: OddsDirection) {
  if (direction === 'in') return 'var(--p-green-500)'
  if (direction === 'out') return 'var(--p-red-500)'
  return 'var(--p-text-muted-color)'
}
</script>

<template>
  <div v-if="odds" class="text-xs tabular-nums" style="color: var(--p-text-muted-color)">
    <div
      class="flex items-center gap-2"
      :class="{ 'cursor-help': !hasBreakdown }"
      v-tooltip.bottom="hasBreakdown ? undefined : { value: t('odds.title'), pt: { text: 'max-w-xs text-xs' } }"
    >
      <template v-for="(o, i) in outcomes" :key="o.code">
        <span v-if="i > 0" aria-hidden="true">·</span>
        <span :aria-label="o.label" class="inline-flex items-center gap-0.5">
          <span class="font-semibold">{{ o.code }}</span> {{ fmt(o.price) }}
          <span
            v-if="o.move.direction !== 'flat'"
            :aria-label="driftLabel(o.move.direction, o.move.delta)"
            v-tooltip.bottom="{ value: driftLabel(o.move.direction, o.move.delta), pt: { text: 'max-w-xs text-xs' } }"
            :style="{ color: driftColor(o.move.direction) }"
          >{{ GLYPH[o.move.direction] }}</span>
        </span>
      </template>
      <button
        v-if="hasBreakdown"
        type="button"
        class="cursor-pointer leading-none"
        :aria-expanded="expanded"
        :aria-label="expanded ? t('odds.hideBreakdown') : t('odds.showBreakdown')"
        v-tooltip.bottom="{ value: expanded ? t('odds.hideBreakdown') : t('odds.showBreakdown'), pt: { text: 'max-w-xs text-xs' } }"
        @click="expanded = !expanded"
      >{{ expanded ? '▾' : '▸' }}</button>
    </div>

    <div v-if="expanded && hasBreakdown" class="mt-1 flex flex-col gap-1">
      <div v-if="odds.initial" class="flex items-center gap-2">
        <span class="font-semibold uppercase tracking-wide" style="opacity: 0.7">{{ t('odds.opening') }}</span>
        <span><span class="font-semibold">1</span> {{ fmt(odds.initial.home) }}</span>
        <span aria-hidden="true">·</span>
        <span><span class="font-semibold">X</span> {{ fmt(odds.initial.draw) }}</span>
        <span aria-hidden="true">·</span>
        <span><span class="font-semibold">2</span> {{ fmt(odds.initial.away) }}</span>
      </div>

      <div v-if="odds.bookmakers && odds.bookmakers.length" class="flex flex-col gap-0.5">
        <span class="font-semibold uppercase tracking-wide" style="opacity: 0.7">{{ t('odds.bookmakers') }}</span>
        <div v-for="b in odds.bookmakers" :key="b.key" class="flex items-center gap-2">
          <span class="truncate" style="min-width: 5rem">{{ b.title }}</span>
          <span><span class="font-semibold">1</span> {{ fmt(b.home) }}</span>
          <span aria-hidden="true">·</span>
          <span><span class="font-semibold">X</span> {{ fmt(b.draw) }}</span>
          <span aria-hidden="true">·</span>
          <span><span class="font-semibold">2</span> {{ fmt(b.away) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
