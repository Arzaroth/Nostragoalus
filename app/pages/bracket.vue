<script setup lang="ts">
const { t } = useI18n()
const { data: bracket, isLoading } = useBracket()
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-5">{{ t('nav.bracket') }}</h1>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!bracket || !bracket.rounds.length" class="opacity-60">{{ t('bracket.empty') }}</div>

    <div v-else>
      <div v-if="bracket.winner" class="mb-6 flex items-center gap-2 text-lg font-bold">
        <span class="text-2xl">🏆</span>
        <img v-if="flagUrl(bracket.winner.code)" :src="flagUrl(bracket.winner.code) || ''" class="w-7 h-7 rounded" alt="" >
        {{ bracket.winner.name }}
      </div>

      <div class="flex gap-4 overflow-x-auto pb-4">
        <div v-for="r in bracket.rounds" :key="r.sequence" class="shrink-0 w-60">
          <h2 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ r.name }}</h2>
          <div class="flex flex-col gap-3">
            <div
              v-for="(m, i) in r.matches"
              :key="i"
              class="ng-card rounded-xl border overflow-hidden"
              style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
            >
              <div class="flex items-center gap-2 px-3 py-2" :class="m.winner === 'HOME' ? 'font-bold' : ''">
                <img v-if="flagUrl(m.homeCode)" :src="flagUrl(m.homeCode) || ''" class="w-5 h-5 rounded" alt="" >
                <span class="flex-1 truncate text-sm">{{ m.homeTeam }}</span>
                <span class="tabular-nums text-sm">{{ m.homeScore ?? '' }}<span v-if="m.homePens != null" class="text-xs opacity-70"> ({{ m.homePens }})</span></span>
              </div>
              <div
                class="flex items-center gap-2 px-3 py-2 border-t"
                :class="m.winner === 'AWAY' ? 'font-bold' : ''"
                style="border-color: var(--p-content-border-color)"
              >
                <img v-if="flagUrl(m.awayCode)" :src="flagUrl(m.awayCode) || ''" class="w-5 h-5 rounded" alt="" >
                <span class="flex-1 truncate text-sm">{{ m.awayTeam }}</span>
                <span class="tabular-nums text-sm">{{ m.awayScore ?? '' }}<span v-if="m.awayPens != null" class="text-xs opacity-70"> ({{ m.awayPens }})</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
