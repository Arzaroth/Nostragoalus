<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('nav.bracket') })
const { data: rawBracket, isLoading } = useBracket()
// Overlay live WS scores and refetch advancement so the tree updates in play.
const { bracket } = useLiveBracket(rawBracket)

const sides = computed(() => splitBracketSides(bracket.value?.rounds ?? []))
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
      <div class="br w-max mx-auto flex items-stretch gap-8 px-6">
        <!-- left side -->
        <div class="flex items-stretch gap-8 br-left">
          <div v-for="(col, ci) in sides.left" :key="'l' + ci" class="br-col" :data-advance="ci < sides.left.length - 1 ? 'true' : 'false'" :data-tail="ci === sides.left.length - 1 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell"><BracketMatchCard :match="m" /></div>
          </div>
        </div>

        <!-- center: a 3-row grid keeps the final on the semis' midline no
             matter what sits above (trophy) or below (3rd place). -->
        <div class="grid grid-rows-[1fr_auto_1fr] justify-items-center px-1 shrink-0">
          <div class="text-center self-end pb-4">
            <i class="pi pi-trophy text-4xl" style="color: #f5b301" />
            <div class="text-xs uppercase tracking-widest font-bold mt-1">{{ bracket?.winner?.name ?? t('bracket.champion') }}</div>
          </div>
          <div v-if="sides.final" class="text-center">
            <div class="text-[10px] uppercase tracking-wider font-semibold mb-1" style="color: var(--p-primary-color)">{{ roundLabel(sides.final.name, t) }}</div>
            <BracketMatchCard v-for="(m, mi) in sides.final.matches" :key="mi" :match="m" />
          </div>
          <div v-else />
          <div v-if="sides.third" class="text-center opacity-80 self-start pt-4">
            <div class="text-[10px] uppercase tracking-wider font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('bracket.round.third') }}</div>
            <BracketMatchCard v-for="(m, mi) in sides.third.matches" :key="mi" :match="m" />
          </div>
          <div v-else />
        </div>

        <!-- right side -->
        <div class="flex items-stretch gap-8 br-right">
          <div v-for="(col, ci) in sides.right" :key="'r' + ci" class="br-col" :data-advance="ci > 0 ? 'true' : 'false'" :data-tail="ci === 0 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell"><BracketMatchCard :match="m" /></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.br {
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
