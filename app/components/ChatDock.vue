<script setup lang="ts">
// Floating, collapsible league chat. Bottom-right, collapsed by default, shown
// on competition pages once a league is selected and its chat is enabled. The
// league detail page keeps its own inline panel, so the dock stays out of its
// way there. Whenever a league is resolved the inner ChatPanel is kept mounted
// (its container is only hidden, never torn down) so its live socket stays open:
// that is what lets a keyholder re-seal the group key for a newcomer without
// opening the chat first, and what makes an admin's enable/disable reflect live
// for everyone - the panel reports its on/off state up via update:enabled.
import { useDraggable, useStorage } from '@vueuse/core'
import { GLOBAL_ROOM, roomKeyOf, useChatActivity } from '~/composables/useChatActivity'
import { withLeagueSelection } from '~/utils/league-cookie'
import type { ChatUnreadRoomDTO } from '#shared/types/chat'

const { t } = useI18n()
const route = useRoute()
const slug = useSelectedCompetition()
const matches = useMatches()
const { leagueId: selectedLeagueId } = useSelectedLeague()
const selections = useLeagueSelections()

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
const activity = useChatActivity({ activeLeagueId: leagueId, activeRoom: activeRoomKey, viewing })

function matchLabel(id: string | null): string {
  if (!id) return t('chat.scope.global')
  const m = matches.data.value?.find((x) => x.id === id)
  if (!m) return t('chat.threadTitle')
  return `${m.homeTeamCode ?? m.homeTeam} v ${m.awayTeamCode ?? m.awayTeam}`
}

// The inbox spans leagues, so a row labels itself from its own DTO (the current
// competition's match list does not cover other leagues' rooms). Match thread =
// the two teams; the league-global room = the league name.
function roomTitle(r: ChatUnreadRoomDTO): string {
  if (!r.matchId) return r.leagueName
  return r.homeTeam && r.awayTeam ? `${r.homeTeam} v ${r.awayTeam}` : t('chat.threadTitle')
}

// Undock: detach the window into a draggable, resizable floating panel. Its
// undocked state and last position persist per device. Dragged by the header,
// resized by the CSS corner handle (see the panel style below).
const undocked = useStorage('ng-chat-undocked', false)
const pos = useStorage('ng-chat-pos', { x: 0, y: 0 })
const dockEl = ref<HTMLElement | null>(null)
const handleEl = ref<HTMLElement | null>(null)
const { x, y, style: dragStyle } = useDraggable(dockEl, {
  handle: handleEl,
  initialValue: pos,
  preventDefault: true,
})
watch([x, y], () => {
  if (undocked.value) pos.value = { x: x.value, y: y.value }
})
function toggleUndock() {
  if (!undocked.value && (pos.value.x === 0 && pos.value.y === 0) && import.meta.client) {
    // First undock: seed a sensible spot near the docked corner.
    x.value = Math.max(8, window.innerWidth - 380)
    y.value = Math.max(8, window.innerHeight - 620)
  }
  undocked.value = !undocked.value
}
// When undocked, the panel is fixed-positioned at the dragged point and resizable;
// docked, it keeps its place in the bottom-right wrapper.
const panelStyle = computed(() => {
  const base = `max-width: 94vw; background: var(--p-content-background); border-color: var(--p-content-border-color)`
  if (undocked.value) {
    return `${dragStyle.value}; position: fixed; z-index: 50; width: ${expanded.value ? '40rem' : '22rem'}; height: 32rem; resize: both; overflow: hidden; ${base}`
  }
  return `width: ${expanded.value ? 'min(48rem, 94vw)' : '22rem'}; ${base}`
})

// "Share a pick to chat" asks the dock to open the global room; the panel there
// picks the queued image into its composer tray. Keep the current scope so a pick
// shared while the Match tab is open lands in the match room, not the league one.
const shareInbox = useChatShareInbox()
watch(shareInbox.requestOpen, () => {
  collapsed.value = false
})

// A mention deep link (push/bell click) asks the dock to open to a room scope.
// The league cookie was already set by the deep-link plugin, so by now this dock
// is bound to the right league; just uncollapse and select the scope. Immediate,
// to catch a request that fired before this dock mounted.
const dockOpen = useChatDockOpen()
watch(
  dockOpen.requestOpen,
  () => {
    const want = dockOpen.take()
    if (!want) return
    collapsed.value = false
    scope.value = want === 'match' && matchId.value ? 'match' : 'global'
  },
  { immediate: true },
)

const roomsOpen = ref(false)
// Open any inbox room, including one in another league/competition: point the
// ng-league cookie at that room's league for its competition, navigate there if
// it is not already the current page, then select the right scope. The dock
// re-resolves its league from the cookie once the page settles.
async function openRoom(r: ChatUnreadRoomDTO) {
  roomsOpen.value = false
  collapsed.value = false
  selections.value = withLeagueSelection(selections.value, r.competitionSlug, r.leagueId)
  const sameComp = r.competitionSlug === slug.value
  if (r.matchId) {
    if (!sameComp || r.matchId !== matchId.value) await navigateTo(`/${r.competitionSlug}/matches/${r.matchId}`)
    scope.value = 'match'
  } else {
    if (!sameComp) await navigateTo(`/${r.competitionSlug}`)
    scope.value = 'global'
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
      <!-- Unread @mentions get their own badge (distinct colour), still counted in
           the global total above. -->
      <span
        v-if="activity.totalMentions.value"
        v-tooltip.left="activity.totalMentions.value === 1 ? t('chat.mention.unreadOne') : t('chat.mention.unread', { n: activity.totalMentions.value })"
        class="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center"
        style="background: var(--ng-star); color: #000"
      >@</span>
    </button>

    <!-- The window. Kept mounted while collapsed/off (v-show) to hold the socket. -->
    <div
      v-show="enabled && !collapsed"
      ref="dockEl"
      class="ng-card rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
      :style="panelStyle"
    >
      <div
        ref="handleEl"
        class="flex items-center gap-2 px-3 py-2 border-b"
        :class="undocked ? 'cursor-move select-none' : ''"
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
            <span v-if="scope !== 'global' && activity.unreadFor(leagueId, GLOBAL_ROOM)" class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
          <button
            type="button"
            class="relative px-2.5 py-1 font-semibold"
            :style="scope === 'match' ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'color: var(--p-text-muted-color)'"
            @click="scope = 'match'"
          >
            {{ t('chat.scope.match') }}
            <span v-if="scope !== 'match' && matchId && activity.unreadFor(leagueId, matchId)" class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
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
            <span v-if="activity.total.value || activity.totalMentions.value" class="absolute -top-1 -right-1 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
          <div
            v-if="roomsOpen"
            class="absolute right-0 top-7 z-10 w-64 rounded-lg border shadow-lg py-1 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('chat.rooms.title') }}</p>
            <p v-if="!activity.rooms.value.length" class="px-3 py-2 text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.rooms.none') }}</p>
            <!-- Cross-league: each row names its room and its league, and may jump to
                 another competition. -->
            <button
              v-for="r in activity.rooms.value"
              :key="`${r.leagueId}:${r.roomKey}`"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:opacity-100 opacity-90 text-left"
              @click="openRoom(r)"
            >
              <i :class="r.matchId ? 'pi pi-flag' : 'pi pi-hashtag'" class="text-xs shrink-0" style="color: var(--p-primary-color)" />
              <span class="flex-1 min-w-0">
                <span class="block truncate">{{ roomTitle(r) }}</span>
                <span class="block truncate text-xs" style="color: var(--p-text-muted-color)">{{ r.leagueName }}</span>
              </span>
              <span v-if="r.mentions" class="w-5 h-5 shrink-0 rounded-full text-xs font-bold flex items-center justify-center" style="background: var(--ng-star); color: #000">@</span>
              <span v-if="r.unread" class="min-w-5 h-5 px-1 shrink-0 rounded-full text-xs font-bold flex items-center justify-center tabular-nums" style="background: var(--ng-danger); color: #fff">{{ r.unread > 99 ? '99+' : r.unread }}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="opacity-70 hover:opacity-100"
          :aria-label="t(undocked ? 'chat.dock.redock' : 'chat.dock.undock')"
          @click="toggleUndock"
        >
          <i :class="undocked ? 'pi pi-thumbtack' : 'pi pi-external-link'" />
        </button>
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
