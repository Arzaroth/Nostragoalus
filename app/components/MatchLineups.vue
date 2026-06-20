<script setup lang="ts">
import type { MatchLineups } from '#shared/types/match'

const props = defineProps<{
  lineups: MatchLineups
  home: string
  away: string
  homeCode?: string | null
  awayCode?: string | null
  slug: string
}>()

const { t } = useI18n()
const NuxtLinkC = resolveComponent('NuxtLink')

// pitchRows (app/utils/lineup) lays the XI out by the formation bands when the
// feed ships one, falling back to grouping by each player's position otherwise.

const sides = computed(() => [
  { team: props.lineups.home, name: props.home, code: props.homeCode },
  { team: props.lineups.away, name: props.away, code: props.awayCode },
])

const teamLink = (code?: string | null) => (code ? `/${props.slug}/teams/${code}` : undefined)
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <div v-for="side in sides" :key="side.name">
      <div class="flex items-center justify-center gap-2 mb-3">
        <component
          :is="side.code ? NuxtLinkC : 'span'"
          :to="teamLink(side.code)"
          class="font-bold"
          :class="side.code ? 'hover:underline' : ''"
        >{{ side.name }}</component>
        <span
          v-if="side.team.formation"
          class="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full"
          style="background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); color: var(--p-primary-color)"
        >{{ side.team.formation }}</span>
      </div>

      <div
        class="rounded-2xl py-4 px-1 flex flex-col gap-4"
        style="background: linear-gradient(170deg, color-mix(in srgb, var(--ng-success) 22%, var(--p-content-background)), color-mix(in srgb, var(--ng-success) 10%, var(--p-content-background)))"
      >
        <div v-for="row in pitchRows(side.team)" :key="row.pos" class="flex justify-around items-start">
          <div v-for="p in row.players" :key="p.playerId" class="flex flex-col items-center gap-1 w-16">
            <div class="relative">
              <img
                v-if="p.pictureUrl"
                :src="p.pictureUrl"
                loading="lazy"
                :alt="p.name"
                class="w-10 h-10 rounded-full object-cover border-2"
                style="border-color: var(--p-content-background); background: var(--p-content-background)"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full grid place-items-center text-sm font-bold tabular-nums border-2"
                style="border-color: var(--p-content-background); background: var(--p-content-background); color: var(--p-text-color)"
              >{{ p.shirtNumber ?? '?' }}</div>
              <span
                v-if="p.captain"
                v-tooltip.top="t('team.captain')"
                class="absolute -right-1 -top-1 w-4 h-4 grid place-items-center text-[9px] font-bold rounded-full"
                style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
              >C</span>
            </div>
            <span class="text-[11px] text-center leading-tight w-full truncate" :title="p.name">
              <span class="tabular-nums opacity-70">{{ p.shirtNumber }}</span> {{ formatPlayerName(p.name) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="side.team.bench.length" class="mt-3">
        <h4 class="text-xs font-semibold uppercase tracking-wider mb-1" style="color: var(--p-text-muted-color)">{{ t('pos.sub') }}</h4>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span v-for="p in side.team.bench" :key="p.playerId">
            <span class="tabular-nums" style="color: var(--p-text-muted-color)">{{ p.shirtNumber ?? '–' }}</span>
            {{ formatPlayerName(p.name) }}<span v-if="p.captain" class="ml-0.5 text-xs" style="color: var(--p-primary-color)">©</span>
          </span>
        </div>
      </div>

      <p v-if="side.team.coach" class="mt-2 text-sm" style="color: var(--p-text-muted-color)">
        {{ t('match.coach') }}: <span style="color: var(--p-text-color)">{{ side.team.coach }}</span>
      </p>
    </div>
  </div>
</template>
