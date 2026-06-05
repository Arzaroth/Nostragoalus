<script setup lang="ts">
const { t } = useI18n()
const { data: bracket, isLoading } = useBracket()

const sides = computed(() => {
  const rounds = bracket.value?.rounds ?? []
  if (!rounds.length) return null
  const final = rounds.find((r: any) => /^final$/i.test(r.name.trim()))
  const third = rounds.find((r: any) => /third/i.test(r.name))
  const side = rounds.filter((r: any) => r !== final && r !== third).sort((a: any, b: any) => a.sequence - b.sequence)
  const left = side.map((r: any) => ({ name: r.name, matches: r.matches.slice(0, Math.ceil(r.matches.length / 2)) }))
  const right = side
    .map((r: any) => ({ name: r.name, matches: r.matches.slice(Math.ceil(r.matches.length / 2)) }))
    .reverse()
  return { left, right, final, third }
})

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

const cardStyle = 'background: var(--p-content-background); border: 1px solid var(--p-content-border-color)'
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-5">{{ t('nav.bracket') }}</h1>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!sides" class="opacity-60">{{ t('bracket.empty') }}</div>

    <div v-else class="overflow-x-auto pb-4">
      <div class="br min-w-max flex items-stretch gap-7">
        <!-- left side -->
        <div class="flex items-stretch gap-7 br-left">
          <div v-for="(col, ci) in sides.left" :key="'l' + ci" class="br-col" :data-advance="ci < sides.left.length - 1 ? 'true' : 'false'" :data-tail="ci === sides.left.length - 1 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell">
              <div class="br-card" :style="cardStyle">
                <div class="flex items-center justify-between gap-2">
                  <span class="br-team" :class="{ win: m.winner === 'HOME' }">
                    <img v-if="flagUrl(m.homeCode)" :src="flagUrl(m.homeCode) || ''" class="w-4 h-4 rounded-sm object-cover" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" />
                    {{ m.homeCode || m.homeTeam }}<b v-if="m.homeScore !== null" class="ml-1 tabular-nums">{{ m.homeScore }}</b>
                  </span>
                  <span class="br-team justify-end" :class="{ win: m.winner === 'AWAY' }">
                    {{ m.awayCode || m.awayTeam }}<b v-if="m.awayScore !== null" class="ml-1 tabular-nums">{{ m.awayScore }}</b>
                    <img v-if="flagUrl(m.awayCode)" :src="flagUrl(m.awayCode) || ''" class="w-4 h-4 rounded-sm object-cover" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" />
                  </span>
                </div>
                <div class="br-date">{{ fmtDate(m.kickoffTime) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- center -->
        <div class="flex flex-col items-center justify-center gap-3 px-2 shrink-0">
          <div class="text-center">
            <i class="pi pi-trophy text-4xl" style="color: #f5b301" />
            <div class="text-xs uppercase tracking-widest font-bold mt-1">{{ bracket.winner ? bracket.winner.name : 'Champion' }}</div>
          </div>
          <div v-if="sides.final" class="br-card !w-44" :style="cardStyle">
            <div class="text-[10px] uppercase tracking-wider text-center font-semibold mb-1" style="color: var(--p-primary-color)">{{ sides.final.name }}</div>
            <div v-for="(m, mi) in sides.final.matches" :key="mi" class="flex items-center justify-between gap-2">
              <span class="br-team" :class="{ win: m.winner === 'HOME' }"><img v-if="flagUrl(m.homeCode)" :src="flagUrl(m.homeCode) || ''" class="w-4 h-4 rounded-sm" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" />{{ m.homeCode || m.homeTeam }}<b v-if="m.homeScore !== null" class="ml-1">{{ m.homeScore }}</b></span>
              <span class="br-team justify-end" :class="{ win: m.winner === 'AWAY' }">{{ m.awayCode || m.awayTeam }}<b v-if="m.awayScore !== null" class="ml-1">{{ m.awayScore }}</b><img v-if="flagUrl(m.awayCode)" :src="flagUrl(m.awayCode) || ''" class="w-4 h-4 rounded-sm" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" /></span>
            </div>
          </div>
          <div v-if="sides.third" class="br-card !w-44 opacity-80" :style="cardStyle">
            <div class="text-[10px] uppercase tracking-wider text-center font-semibold mb-1" style="color: var(--p-text-muted-color)">3rd place</div>
            <div v-for="(m, mi) in sides.third.matches" :key="mi" class="flex items-center justify-between gap-2 text-xs">
              <span class="br-team">{{ m.homeCode || m.homeTeam }}<b v-if="m.homeScore !== null" class="ml-1">{{ m.homeScore }}</b></span>
              <span class="br-team justify-end">{{ m.awayCode || m.awayTeam }}<b v-if="m.awayScore !== null" class="ml-1">{{ m.awayScore }}</b></span>
            </div>
          </div>
        </div>

        <!-- right side -->
        <div class="flex items-stretch gap-7 br-right">
          <div v-for="(col, ci) in sides.right" :key="'r' + ci" class="br-col" :data-advance="ci > 0 ? 'true' : 'false'" :data-tail="ci === 0 ? 'true' : 'false'">
            <div v-for="(m, mi) in col.matches" :key="mi" class="br-cell">
              <div class="br-card" :style="cardStyle">
                <div class="flex items-center justify-between gap-2">
                  <span class="br-team" :class="{ win: m.winner === 'HOME' }">
                    <img v-if="flagUrl(m.homeCode)" :src="flagUrl(m.homeCode) || ''" class="w-4 h-4 rounded-sm object-cover" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" />
                    {{ m.homeCode || m.homeTeam }}<b v-if="m.homeScore !== null" class="ml-1 tabular-nums">{{ m.homeScore }}</b>
                  </span>
                  <span class="br-team justify-end" :class="{ win: m.winner === 'AWAY' }">
                    {{ m.awayCode || m.awayTeam }}<b v-if="m.awayScore !== null" class="ml-1 tabular-nums">{{ m.awayScore }}</b>
                    <img v-if="flagUrl(m.awayCode)" :src="flagUrl(m.awayCode) || ''" class="w-4 h-4 rounded-sm object-cover" alt="" ><i v-else class="pi pi-shield text-xs opacity-40" />
                  </span>
                </div>
                <div class="br-date">{{ fmtDate(m.kickoffTime) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
}
.br-card {
  width: 9.5rem;
  border-radius: 0.6rem;
  padding: 0.45rem 0.6rem;
}
.br-team {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
}
.br-team.win {
  font-weight: 800;
}
.br-date {
  margin-top: 0.25rem;
  font-size: 0.62rem;
  color: var(--p-text-muted-color);
}

/* connector colour */
.br {
  --line: var(--p-content-border-color);
}

/* left side: lines advance to the right */
.br-left .br-col[data-advance='true'] .br-cell::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  width: 1.75rem;
  border-top: 2px solid var(--line);
}
.br-left .br-col[data-advance='true'] .br-cell:nth-child(odd)::before {
  content: '';
  position: absolute;
  left: calc(100% + 1.75rem);
  top: 50%;
  height: 50%;
  border-left: 2px solid var(--line);
}
.br-left .br-col[data-advance='true'] .br-cell:nth-child(even)::before {
  content: '';
  position: absolute;
  left: calc(100% + 1.75rem);
  bottom: 50%;
  height: 50%;
  border-left: 2px solid var(--line);
}
.br-left .br-col[data-tail='true'] .br-cell::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  width: 1.75rem;
  border-top: 2px solid var(--line);
}

/* right side: mirrored to the left */
.br-right .br-col[data-advance='true'] .br-cell::after {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  width: 1.75rem;
  border-top: 2px solid var(--line);
}
.br-right .br-col[data-advance='true'] .br-cell:nth-child(odd)::before {
  content: '';
  position: absolute;
  right: calc(100% + 1.75rem);
  top: 50%;
  height: 50%;
  border-right: 2px solid var(--line);
}
.br-right .br-col[data-advance='true'] .br-cell:nth-child(even)::before {
  content: '';
  position: absolute;
  right: calc(100% + 1.75rem);
  bottom: 50%;
  height: 50%;
  border-right: 2px solid var(--line);
}
.br-right .br-col[data-tail='true'] .br-cell::after {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  width: 1.75rem;
  border-top: 2px solid var(--line);
}
</style>
