<script setup lang="ts">
import type { SquadPlayer } from '#shared/types/match'

const props = defineProps<{ player: SquadPlayer }>()
const { t } = useI18n()

// FIFA ships full-body shots (digitalhub); zoom into the top to frame the head.
// UEFA/Sofascore head-shots are already framed, so leave them centred.
const headShot = computed(() => (props.player.pictureUrl?.includes('digitalhub.fifa.com') ? 'object-top origin-top scale-[1.7]' : 'object-center'))
</script>

<template>
  <div class="flex flex-col items-center gap-0.5 w-16">
    <div class="relative">
      <div
        class="w-14 h-14 rounded-full overflow-hidden border-2"
        style="border-color: var(--p-content-background); background: var(--p-content-background)"
      >
        <img
          v-if="player.pictureUrl"
          :src="player.pictureUrl"
          loading="lazy"
          :alt="player.name"
          class="w-full h-full object-cover"
          :class="headShot"
        />
        <div
          v-else
          class="w-full h-full grid place-items-center text-base font-bold tabular-nums"
          style="color: var(--p-text-color)"
        >{{ player.shirtNumber ?? '?' }}</div>
      </div>
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
