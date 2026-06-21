<script setup lang="ts">
import type { MatchLineups, TeamLineup } from '#shared/types/match'

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

// Place the XI on a real pitch when every starter has a coordinate (UEFA's feed,
// or FIFA refined by Sofascore); otherwise pitchRows (app/utils/lineup) lays it
// out by formation bands.
const placed = (team: TeamLineup) => team.startingXI.length > 0 && team.startingXI.every((p) => p.x != null && p.y != null)

const sides = computed(() => [
  { team: props.lineups.home, name: props.home, code: props.homeCode },
  { team: props.lineups.away, name: props.away, code: props.awayCode },
])

// Faint mown stripes over a grass gradient; PitchHalf draws the white markings.
const PITCH_BG =
  'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 12%, transparent 12% 24%), ' +
  'linear-gradient(170deg, color-mix(in srgb, var(--ng-success) 24%, var(--p-content-background)), color-mix(in srgb, var(--ng-success) 12%, var(--p-content-background)))'

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

      <div class="relative rounded-2xl overflow-hidden" style="aspect-ratio: 3 / 4" :style="{ background: PITCH_BG }">
        <PitchHalf />
        <!-- real pitch placement when we have coordinates for the whole XI -->
        <template v-if="placed(side.team)">
          <div
            v-for="p in side.team.startingXI"
            :key="p.playerId"
            class="absolute"
            :style="`left: ${p.x}%; bottom: ${p.y}%; transform: translate(-50%, 50%)`"
          >
            <LineupPlayer :player="p" />
          </div>
        </template>
        <!-- fallback: formation-band rows, spread over the pitch -->
        <div v-else class="relative h-full flex flex-col justify-around py-3">
          <div v-for="row in pitchRows(side.team)" :key="row.pos" class="flex justify-around items-start">
            <LineupPlayer v-for="p in row.players" :key="p.playerId" :player="p" />
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
