<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('nav.bracket') })
const { data: rawBracket, isLoading } = useBracket()
// Overlay live WS scores and refetch advancement so the tree updates in play.
const { bracket } = useLiveBracket(rawBracket)

const sides = computed(() => splitBracketSides(bracket.value?.rounds ?? []))

const brEl = useTemplateRef<HTMLElement>('brEl')
type Kind = 'win' | 'loss' | 'home' | 'away'
const journeys = ref<{ key: string; d: string; kind: Kind; hop: number }[]>([])
// The card being traced. Kept out of the render so re-entering it is a no-op
// rather than a restart: `mouseover` fires again for every child crossed.
let traced: HTMLElement | null = null
// Bumped per traced card so the paths get fresh keys and Vue remounts them.
// Without it, two cards sharing a team and outcome (a semi-final and the final
// the same side won) reuse a key, and a patched element keeps its finished
// animation instead of drawing again.
let pass = 0

function cardsOf(code: string) {
  const sel = `.br-card[data-home="${CSS.escape(code)}"], .br-card[data-away="${CSS.escape(code)}"]`
  return [...(brEl.value?.querySelectorAll<HTMLElement>(sel) ?? [])]
    .map(el => ({ seq: Number(el.dataset.seq ?? 0), rect: el.getBoundingClientRect() }))
    .sort((a, b) => a.seq - b.seq)
}

function clearTrace() {
  traced = null
  journeys.value = []
}

// Hovering a cell with two known teams traces both their journeys, emanating
// from the hovered card: a decided tie colours winner green / loser red, an
// undecided tie with both sides official colours home / away instead (no outcome
// to read yet). Anything else - a gap, a card still missing a side - clears the
// trace. Delegated, so it also fires moving card-to-card.
function onEnter(e: Event) {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.br-card')
  if (card === traced) return
  if (!brEl.value || !card) {
    clearTrace()
    return
  }
  const { winner, home, away } = card.dataset
  let legs: [string | undefined, Kind][]
  if (winner) {
    legs = [
      [winner === 'HOME' ? home : away, 'win'],
      [winner === 'HOME' ? away : home, 'loss'],
    ]
  } else if (home && away) {
    legs = [[home, 'home'], [away, 'away']]
  } else {
    clearTrace()
    return
  }
  traced = card
  pass++
  const origin = brEl.value.getBoundingClientRect()
  const hoveredSeq = Number(card.dataset.seq ?? 0)
  journeys.value = legs.flatMap(([code, kind]) => {
    if (!code) return []
    const cards = cardsOf(code)
    const hovered = cards.findIndex(c => c.seq === hoveredSeq)
    return bracketJourneyHops(cards.map(c => c.rect), hovered, origin)
      .map((h, i) => ({ key: `${pass}-${kind}-${i}`, kind, d: h.d, hop: h.delay }))
  })
}

// A live score can re-render the tree (a winner flips on a VAR reversal, a
// projected side resolves) under a stationary pointer, with no event to
// recompute against. The measured routes and the win/loss colours would both be
// stale, so drop the trace and let the next move redraw it.
watch(bracket, clearTrace)
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <h1 class="text-2xl font-bold">{{ t('nav.bracket') }}</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <CompetitionPill />
      </div>
    </div>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!sides" class="opacity-60">{{ t('bracket.empty') }}</div>

    <div v-else class="overflow-x-auto pb-4" style="width: 100vw; margin-inline-start: calc(50% - 50vw)">
      <!-- focusin as well as mouseover: a decided card is a link, so tabbing the
           tree traces the same journeys a pointer would. -->
      <div ref="brEl" class="br w-max mx-auto flex items-stretch gap-8 px-6" @mouseover="onEnter" @focusin="onEnter" @mouseleave="clearTrace">
        <svg class="br-journey" aria-hidden="true">
          <!-- pathLength, not path-length: SVG attribute names are case-sensitive
               and an unknown one is silently ignored, which would leave the dash
               pattern measured in pixels instead of whole-path units. -->
          <path v-for="j in journeys" :key="j.key" :d="j.d" :class="'br-line br-line-' + j.kind" :style="{ '--hop': j.hop }" pathLength="1" /></svg>
        <!-- left side -->
        <div class="flex items-stretch gap-8 br-left">
          <div v-for="(col, ci) in sides.left" :key="'l' + ci" class="br-col" :data-advance="ci < sides.left.length - 1 ? 'true' : 'false'" :data-tail="ci === sides.left.length - 1 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell"><BracketMatchCard :match="m" :seq="col.sequence" /></div>
          </div>
        </div>

        <!-- center: the final sits above the semis' midline and the third-place
             tie below it, so the winner roads (rising into the final) and the
             loser roads (falling into the bronze) never share a horizontal lane.
             A 3-row grid pins the empty middle row on the midline. -->
        <div class="grid grid-rows-[1fr_auto_1fr] justify-items-center px-1 shrink-0">
          <div class="self-end flex flex-col items-center gap-3 pb-6">
            <div class="text-center">
              <i class="pi pi-trophy text-4xl" style="color: #f5b301" />
              <div class="text-xs uppercase tracking-widest font-bold mt-1">{{ bracket?.winner?.name ?? t('bracket.champion') }}</div>
            </div>
            <div v-if="sides.final" class="text-center">
              <div class="text-[10px] uppercase tracking-wider font-semibold mb-1" style="color: var(--p-primary-color)">{{ roundLabel(sides.final.name, t) }}</div>
              <BracketMatchCard v-for="(m, mi) in sides.final.matches" :key="mi" :match="m" :seq="sides.final.sequence" />
            </div>
          </div>
          <div />
          <div v-if="sides.third" class="text-center opacity-80 self-start pt-6">
            <div class="text-[10px] uppercase tracking-wider font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('bracket.round.third') }}</div>
            <BracketMatchCard v-for="(m, mi) in sides.third.matches" :key="mi" :match="m" :seq="sides.third.sequence" />
          </div>
          <div v-else />
        </div>

        <!-- right side -->
        <div class="flex items-stretch gap-8 br-right">
          <div v-for="(col, ci) in sides.right" :key="'r' + ci" class="br-col" :data-advance="ci > 0 ? 'true' : 'false'" :data-tail="ci === 0 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell"><BracketMatchCard :match="m" :seq="col.sequence" /></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.br {
  position: relative;
  --line: var(--p-content-border-color);
  /* Stretch columns so the dense edge rounds (8 matches) get vertical air.
     The 270px budget covers header + page paddings + the site footer. */
  min-height: max(620px, calc(100vh - 270px));
}
.br-col {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}
/* Journey overlay: sits above the static elbows, below nothing that takes input.
   One <path> per hop; pathLength=1 normalises each to unit length so a single
   keyframe draws it in a fixed time. The per-hop delay (--hop, its distance from
   the hovered card) staggers the draw outward from the hover, and because every
   hop takes the same time two teams of unequal reach stay in step. */
.br-journey {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
.br-line {
  --hop-dur: 0.4s;
  fill: none;
  stroke: var(--road);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--road) 55%, transparent));
  /* `both`, not `forwards`: hold the undrawn first frame through the delay so a
     later hop stays hidden until its turn rather than flashing in fully drawn. */
  animation: br-draw var(--hop-dur) ease-in-out both;
  animation-delay: calc(var(--hop, 0) * var(--hop-dur));
}
.br-line-win {
  --road: var(--ng-success);
}
.br-line-loss {
  --road: var(--ng-danger);
}
/* Undecided tie: no outcome to read, so the two still-alive sides get told apart
   by home (accent) / away (amber) instead of win / loss. */
.br-line-home {
  --road: var(--p-primary-color);
}
.br-line-away {
  --road: var(--ng-star);
}
@keyframes br-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .br-line {
    animation: none;
    stroke-dashoffset: 0;
  }
}
.br-cell {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  position: relative;
  padding: 4px 0;
}

/* left side: a short stub out of each card, verticals merging at mid-gap,
   then a straight lead-in to the next fixture (classic bracket elbows). */
.br-left .br-col[data-advance='true'] .br-cell::after,
.br-left .br-col[data-tail='true'] .br-cell::after {
  content: '';
  position: absolute;
  inset-inline-start: 100%;
  top: 50%;
  width: 0.75rem;
  border-top: 2px solid var(--line);
}
.br-left .br-col[data-advance='true'] .br-cell:nth-child(odd)::before {
  content: '';
  position: absolute;
  inset-inline-start: calc(100% + 0.75rem);
  top: 50%;
  height: 50%;
  width: 1.25rem;
  border-inline-start: 2px solid var(--line);
  border-bottom: 2px solid var(--line);
}
.br-left .br-col[data-advance='true'] .br-cell:nth-child(even)::before {
  content: '';
  position: absolute;
  inset-inline-start: calc(100% + 0.75rem);
  bottom: 50%;
  height: 50%;
  width: 1.25rem;
  border-inline-start: 2px solid var(--line);
  border-top: 2px solid var(--line);
}

/* right side: mirrored to the left */
.br-right .br-col[data-advance='true'] .br-cell::after,
.br-right .br-col[data-tail='true'] .br-cell::after {
  content: '';
  position: absolute;
  inset-inline-end: 100%;
  top: 50%;
  width: 0.75rem;
  border-top: 2px solid var(--line);
}
.br-right .br-col[data-advance='true'] .br-cell:nth-child(odd)::before {
  content: '';
  position: absolute;
  inset-inline-end: calc(100% + 0.75rem);
  top: 50%;
  height: 50%;
  width: 1.25rem;
  border-inline-end: 2px solid var(--line);
  border-bottom: 2px solid var(--line);
}
.br-right .br-col[data-advance='true'] .br-cell:nth-child(even)::before {
  content: '';
  position: absolute;
  inset-inline-end: calc(100% + 0.75rem);
  bottom: 50%;
  height: 50%;
  width: 1.25rem;
  border-inline-end: 2px solid var(--line);
  border-top: 2px solid var(--line);
}
</style>
