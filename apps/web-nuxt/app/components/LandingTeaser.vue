<script setup lang="ts">
import { flagUrl } from '../utils/format'
import { pickNextMatch } from '../utils/landing'

// Signed-out social proof on the landing hero: the soonest fixture plus
// name-free aggregate counts. Every piece is conditional, so the strip stays
// clean while the data is thin (pre-tournament) and fills in on its own.
const { t } = useI18n()
const { data: matches } = useMatches()
const { data: stats } = usePublicStats()

const now = useTimestamp({ interval: 60_000 })
const next = computed(() => pickNextMatch(matches.value ?? [], now.value))
const players = computed(() => stats.value?.players ?? 0)
const predictions = computed(() => stats.value?.predictions ?? 0)
const show = computed(() => !!next.value || players.value > 0 || predictions.value > 0)
</script>

<template>
  <div v-if="show" class="flex flex-col items-center gap-3">
    <div
      v-if="next"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-2.5 text-sm max-w-[calc(100vw-2rem)]"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
    >
      <span class="flex items-center gap-2">
        <span class="font-medium" style="color: var(--p-text-muted-color)">{{ t('home.nextCta.title') }}</span>
        <Countdown :to="next.kickoffTime" />
      </span>
      <span class="flex flex-col sm:flex-row items-center justify-center gap-x-1.5 font-semibold text-center">
        <span class="flex items-center gap-1.5">
          <img v-if="flagUrl(next.homeTeamCode)" :src="flagUrl(next.homeTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
          {{ next.homeTeam }}
        </span>
        <span style="color: var(--p-text-muted-color)">-</span>
        <span class="flex items-center gap-1.5">
          <img v-if="flagUrl(next.awayTeamCode)" :src="flagUrl(next.awayTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
          {{ next.awayTeam }}
        </span>
      </span>
    </div>
    <div
      v-if="players || predictions"
      class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm"
      style="color: var(--p-text-muted-color)"
    >
      <span v-if="players" class="flex items-center gap-1.5"><i class="pi pi-users" style="font-size: 0.8rem" />{{ t('landing.teaser.players', { n: players }, players) }}</span>
      <span v-if="predictions" class="flex items-center gap-1.5"><i class="pi pi-bullseye" style="font-size: 0.8rem" />{{ t('landing.teaser.predictions', { n: predictions }, predictions) }}</span>
    </div>
  </div>
</template>
