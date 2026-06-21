<script setup lang="ts">
import type { SquadPlayer } from '#shared/types/match'

const props = defineProps<{ player: SquadPlayer }>()
const { t } = useI18n()

// FIFA ships full-body shots (digitalhub); frame the head by anchoring the crop
// to the top. UEFA/Sofascore head-shots stay centred.
const headShot = computed(() => (props.player.pictureUrl?.includes('digitalhub.fifa.com') ? 'object-top' : 'object-center'))
</script>

<template>
  <div class="flex flex-col items-center gap-0.5 w-16">
    <div class="relative">
      <img
        v-if="player.pictureUrl"
        :src="player.pictureUrl"
        loading="lazy"
        :alt="player.name"
        class="w-10 h-10 rounded-full object-cover border-2"
        :class="headShot"
        style="border-color: var(--p-content-background); background: var(--p-content-background)"
      />
      <div
        v-else
        class="w-10 h-10 rounded-full grid place-items-center text-sm font-bold tabular-nums border-2"
        style="border-color: var(--p-content-background); background: var(--p-content-background); color: var(--p-text-color)"
      >{{ player.shirtNumber ?? '?' }}</div>
      <span
        v-if="player.captain"
        v-tooltip.top="t('team.captain')"
        class="absolute -right-1 -top-1 w-4 h-4 grid place-items-center text-[9px] font-bold rounded-full"
        style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
      >C</span>
    </div>
    <span class="text-[11px] text-center leading-tight w-[4.5rem]">
      <span class="tabular-nums opacity-70">{{ player.shirtNumber }}</span> {{ lineupName(player.name) }}
    </span>
  </div>
</template>
