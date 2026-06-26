<script setup lang="ts">
// Floating, collapsible league chat. Bottom-right, collapsed by default, shown
// on competition pages once a league is selected and its chat is enabled. The
// league detail page keeps its own inline panel, so the dock stays out of its
// way there. Whenever a league is resolved the inner ChatPanel is kept mounted
// (its container is only hidden, never torn down) so its live socket stays open:
// that is what lets a keyholder re-seal the group key for a newcomer without
// opening the chat first, and what makes an admin's enable/disable reflect live
// for everyone - the panel reports its on/off state up via update:enabled.
import { GLOBAL_ROOM, roomKeyOf, useChatActivity } from '~/composables/useChatActivity'

const { t } = useI18n()
const route = useRoute()
const slug = useSelectedCompetition()
const matches = useMatches()
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

// Cross-room unread: the room being viewed (when open) clears; everything else
// accrues so we can badge the bubble, the scope toggle and the rooms list.
const viewing = computed(() => enabled.value && !collapsed.value)
const activeRoomKey = computed(() => roomKeyOf(scopedMatchId.value))
const activity = useChatActivity(leagueId, { activeRoom: activeRoomKey, viewing })

function matchLabel(id: string | null): string {
  if (!id) return t('chat.scope.global')
  const m = matches.data.value?.find((x) => x.id === id)
  if (!m) return t('chat.threadTitle')
  return `${m.homeTeamCode ?? m.homeTeam} v ${m.awayTeamCode ?? m.awayTeam}`
}

const roomsOpen = ref(false)
async function openRoom(roomMatchId: string | null) {
  roomsOpen.value = false
  collapsed.value = false
  if (!roomMatchId) {
    scope.value = 'global'
    return
  }
  if (roomMatchId === matchId.value) {
    scope.value = 'match'
    return
  }
  // A different match's thread: navigate to that match, where its chat lives.
  if (slug.value) {
    await navigateTo(`/${slug.value}/matches/${roomMatchId}`)
    scope.value = 'match'
  }
}
</script>

<template>
  <div v-if="leagueId" class="fixed bottom-4 right-4 z-40 flex flex-col items-end" style="max-width: 92vw">
    <!-- Collapsed: a chat bubble (only once chat is on), badged with unread. -->
    <button
      v-show="enabled && collapsed"
      type="button"
      class="relative rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
      :aria-label="t('chat.dock.open')"
      @click="collapsed = false"
    >
      <i class="pi pi-comments text-xl" />
      <span
        v-if="activity.total.value"
        class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center tabular-nums"
        style="background: var(--ng-danger); color: #fff"
      >{{ activity.total.value > 99 ? '99+' : activity.total.value }}</span>
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
            class="relative px-2.5 py-1 font-semibold"
            :style="scope === 'global' ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'color: var(--p-text-muted-color)'"
            @click="scope = 'global'"
          >
            {{ t('chat.scope.global') }}
            <span v-if="scope !== 'global' && activity.unreadFor(GLOBAL_ROOM)" class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
          <button
            type="button"
            class="relative px-2.5 py-1 font-semibold"
            :style="scope === 'match' ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'color: var(--p-text-muted-color)'"
            @click="scope = 'match'"
          >
            {{ t('chat.scope.match') }}
            <span v-if="scope !== 'match' && matchId && activity.unreadFor(matchId)" class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
        </div>
        <span v-else class="text-sm font-semibold">{{ t('chat.dock.title') }}</span>

        <!-- Rooms with activity: jump to whichever room has unread. -->
        <div class="relative ml-auto">
          <button
            type="button"
            class="relative opacity-70 hover:opacity-100"
            :aria-label="t('chat.rooms.button')"
            @click="roomsOpen = !roomsOpen"
          >
            <i class="pi pi-inbox" />
            <span v-if="activity.total.value" class="absolute -top-1 -right-1 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
          <div
            v-if="roomsOpen"
            class="absolute right-0 top-7 z-10 w-56 rounded-lg border shadow-lg py-1 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('chat.rooms.title') }}</p>
            <p v-if="!activity.activeRooms.value.length" class="px-3 py-2 text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.rooms.none') }}</p>
            <button
              v-for="r in activity.activeRooms.value"
              :key="r.roomKey"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:opacity-100 opacity-90 text-left"
              @click="openRoom(r.matchId)"
            >
              <i :class="r.matchId ? 'pi pi-flag' : 'pi pi-hashtag'" class="text-xs" style="color: var(--p-primary-color)" />
              <span class="flex-1 truncate">{{ matchLabel(r.matchId) }}</span>
              <span class="min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center tabular-nums" style="background: var(--ng-danger); color: #fff">{{ r.count }}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="opacity-70 hover:opacity-100"
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
        <ChatPanel :league-id="leagueId" :match-id="scopedMatchId" :match-label="scopedMatchId ? matchLabel(scopedMatchId) : ''" flat :tall="expanded" :active="enabled && !collapsed" @update:enabled="enabled = $event" />
      </div>
    </div>
  </div>
</template>
