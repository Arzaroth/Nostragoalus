<script setup lang="ts">
import type { League } from '../composables/useLeagues'

const { t } = useI18n()
const { session } = useAuth()
const { leagueId, league, leagues } = useSelectedLeague()
const menu = ref()
const joinOpen = ref(false)
const createOpen = ref(false)

function select(id: string | null) {
  menu.value?.hide?.()
  leagueId.value = id
}

// Dialog success: the pill always operates on the current competition, so the
// new league is immediately selectable.
function onJoined(joined: League) {
  joinOpen.value = false
  leagueId.value = joined.id
}
function onCreated(created: League) {
  createOpen.value = false
  leagueId.value = created.id
}
</script>

<template>
  <ClientOnly>
    <template v-if="session?.data">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
        style="border-color: var(--p-content-border-color); background: var(--p-content-background)"
        :aria-label="t('leagues.pillLabel')"
        @click="(e) => menu.toggle(e)"
      >
        <i class="pi pi-users" style="color: var(--p-primary-color)" />
        <span class="truncate max-w-[10rem]">{{ league?.name ?? t('leagues.global') }}</span>
        <i class="pi pi-chevron-down text-xs opacity-60" />
      </button>
      <Popover ref="menu">
        <div class="flex flex-col w-64 -m-1">
          <button
            type="button"
            class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            :class="{ 'font-bold': !leagueId }"
            @click="select(null)"
          >
            <i class="pi pi-globe text-xs" :style="!leagueId ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
            <span class="flex-1 truncate">{{ t('leagues.global') }}</span>
            <i v-if="!leagueId" class="pi pi-check text-xs" style="color: var(--p-primary-color)" />
          </button>
          <button
            v-for="l in leagues ?? []"
            :key="l.id"
            type="button"
            class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            :class="{ 'font-bold': l.id === leagueId }"
            @click="select(l.id)"
          >
            <i class="pi pi-users text-xs" :style="l.id === leagueId ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
            <span class="flex-1 truncate">{{ l.name }}</span>
            <i v-if="l.id === leagueId" class="pi pi-check text-xs" style="color: var(--p-primary-color)" />
          </button>
          <div class="my-1 border-t" style="border-color: var(--p-content-border-color)" />
          <button
            type="button"
            class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            @click="menu?.hide?.(); joinOpen = true"
          >
            <i class="pi pi-sign-in text-xs opacity-60" />
            <span class="flex-1">{{ t('leagues.join') }}</span>
          </button>
          <button
            type="button"
            class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            @click="menu?.hide?.(); createOpen = true"
          >
            <i class="pi pi-plus text-xs opacity-60" />
            <span class="flex-1">{{ t('leagues.create') }}</span>
          </button>
          <NuxtLink
            to="/leagues"
            class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            @click="menu?.hide?.()"
          >
            <i class="pi pi-search text-xs opacity-60" />
            <span class="flex-1">{{ t('leagues.publicBrowse') }}</span>
          </NuxtLink>
        </div>
      </Popover>
      <LeagueJoinDialog v-model:visible="joinOpen" @joined="onJoined" />
      <LeagueCreateDialog v-model:visible="createOpen" @created="onCreated" />
    </template>
  </ClientOnly>
</template>
