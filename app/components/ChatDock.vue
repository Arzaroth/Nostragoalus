<script setup lang="ts">
// Floating, collapsible league chat. Bottom-right, collapsed by default, shown
// on competition pages once a league is selected and its chat is enabled. The
// league detail page keeps its own inline panel, so the dock stays out of its
// way there. Whenever a league is resolved the inner ChatPanel is kept mounted
// (its container is only hidden, never torn down) so its live socket stays open:
// that is what lets a keyholder re-seal the group key for a newcomer without
// opening the chat first, and what makes an admin's enable/disable reflect live
// for everyone - the panel reports its on/off state up via update:enabled.
const { t } = useI18n()
const route = useRoute()
const { leagueId: selectedLeagueId } = useSelectedLeague()

// The league detail/list pages render the chat inline; don't double it there.
const onLeaguePages = computed(() => route.path === '/leagues' || route.path.startsWith('/leagues/'))
const leagueId = computed<string | null>(() => (onLeaguePages.value ? null : selectedLeagueId.value))

// A match detail route unlocks the Global/Match scope toggle.
const matchId = computed<string | null>(() =>
  String(route.name) === 'competition-matches-id' ? (route.params.id as string) : null,
)

const enabled = ref(false)
const collapsed = ref(true)
const expanded = ref(false)
const scope = ref<'global' | 'match'>('global')
// Off a match page there is no match room: pin scope to global and hide the toggle.
watch(matchId, (m) => {
  if (!m) scope.value = 'global'
})
const scopedMatchId = computed<string | null>(() => (scope.value === 'match' ? matchId.value : null))
</script>

<template>
  <div v-if="leagueId" class="fixed bottom-4 right-4 z-40 flex flex-col items-end" style="max-width: 92vw">
    <!-- Collapsed: a chat bubble (only once chat is on). -->
    <button
      v-show="enabled && collapsed"
      type="button"
      class="rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
      :aria-label="t('chat.dock.open')"
      @click="collapsed = false"
    >
      <i class="pi pi-comments text-xl" />
    </button>

    <!-- The window. Kept mounted while collapsed/off (v-show) to hold the socket. -->
    <div
      v-show="enabled && !collapsed"
      class="ng-card rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
      :style="`width: ${expanded ? 'min(48rem, 94vw)' : '22rem'}; max-width: 94vw; background: var(--p-content-background); border-color: var(--p-content-border-color)`"
    >
      <div
        class="flex items-center gap-2 px-3 py-2 border-b"
        style="border-color: var(--p-content-border-color); background: var(--p-content-background)"
      >
        <div v-if="matchId" class="flex items-center rounded-lg overflow-hidden text-xs" style="border: 1px solid var(--p-content-border-color)">
          <button
            type="button"
            class="px-2.5 py-1 font-semibold"
            :style="scope === 'global' ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'color: var(--p-text-muted-color)'"
            @click="scope = 'global'"
          >
            {{ t('chat.scope.global') }}
          </button>
          <button
            type="button"
            class="px-2.5 py-1 font-semibold"
            :style="scope === 'match' ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'color: var(--p-text-muted-color)'"
            @click="scope = 'match'"
          >
            {{ t('chat.scope.match') }}
          </button>
        </div>
        <span v-else class="text-sm font-semibold">{{ t('chat.dock.title') }}</span>
        <button
          type="button"
          class="ml-auto opacity-70 hover:opacity-100"
          :aria-label="t(expanded ? 'chat.dock.shrink' : 'chat.dock.expand')"
          @click="expanded = !expanded"
        >
          <i :class="expanded ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
        </button>
        <button
          type="button"
          class="opacity-70 hover:opacity-100"
          :aria-label="t('chat.dock.collapse')"
          @click="collapsed = true"
        >
          <i class="pi pi-chevron-down" />
        </button>
      </div>

      <div class="p-3">
        <ChatPanel :league-id="leagueId" :match-id="scopedMatchId" flat :tall="expanded" @update:enabled="enabled = $event" />
      </div>
    </div>
  </div>
</template>
