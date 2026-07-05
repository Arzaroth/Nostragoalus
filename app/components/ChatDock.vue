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
const { leagueId: selectedLeagueId, league: selectedLeague, leagues: myLeagues } = useSelectedLeague()
const selections = useLeagueSelections()

// The league detail/list pages render the chat inline; don't double it there.
const onLeaguePages = computed(() => route.path === '/leagues' || route.path.startsWith('/leagues/'))
const leagueId = computed<string | null>(() => (onLeaguePages.value ? null : selectedLeagueId.value))

// The focused multiview cell wins; otherwise a match detail route unlocks the
// Global/Match scope toggle. Either way there's a single match thread in view.
const mvFocus = useMultiviewFocus()
const matchId = computed<string | null>(() =>
  mvFocus.focusedMatchId.value ?? (String(route.name) === 'competition-matches-id' ? (route.params.id as string) : null),
)

const enabled = ref(false)
const collapsed = ref(true)
const expanded = ref(false)
// The inner panel is loaded AND decrypted (its `readable` emit). We only mark a
// room read when this is true, so a room we cannot decrypt is not silently read.
const panelReadable = ref(false)
const scope = ref<'global' | 'match'>('global')
// Off a match page there is no match room: pin scope to global and hide the toggle.
watch(matchId, (m) => {
  if (!m) scope.value = 'global'
})
// A multiview cell gaining focus re-targets the dock at that match's thread
// (silently: it does not pop the dock open - only an explicit inbox/deep-link
// click does that).
watch(mvFocus.focusedMatchId, (id) => {
  if (id) scope.value = 'match'
})
const scopedMatchId = computed<string | null>(() => (scope.value === 'match' ? matchId.value : null))

// Cross-room unread: the room being read (open AND decrypted) clears; everything
// else accrues so we can badge the bubble, the scope toggle and the rooms list.
const viewing = computed(() => enabled.value && !collapsed.value)
const activeRoomKey = computed(() => roomKeyOf(scopedMatchId.value))
// Read receipts require the room to be both open and decrypted, so switching into
// a room we cannot read yet does not mark it read (it clears once it decrypts).
const readable = computed(() => viewing.value && panelReadable.value)
// The panel stays mounted across a league/room switch, so `panelReadable` still
// holds the previous room's value until the panel reloads and re-emits. Drop it
// the instant the target changes - this watch is registered before useChatActivity
// so it runs first in the same flush - or a switch would mark the new, not-yet-
// decrypted room read off the old room's readiness.
watch([leagueId, activeRoomKey], () => {
  panelReadable.value = false
})
const activity = useChatActivity({ activeLeagueId: leagueId, activeRoom: activeRoomKey, readable })

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
// Switch league without leaving the chat (otherwise you'd scroll to the pill up
// top). Lists this competition's leagues; picking one repoints the ng-league
// cookie for the current competition, which re-resolves the dock's room live.
const leaguesOpen = ref(false)
// Only leagues with chat on are worth switching to from the chat dock; a
// chat-less league would just land on a disabled panel.
const chatLeagues = computed(() => (myLeagues.value ?? []).filter((l) => l.chatEnabled))
function switchLeague(id: string): void {
  leaguesOpen.value = false
  selectedLeagueId.value = id
}

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
    // If that match is a cell in the current multiview, focus it in place instead
    // of leaving the grid for the detail page.
    if (sameComp && mvFocus.tryFocus(r.matchId)) {
      scope.value = 'match'
      return
    }
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
      data-tour="chat"
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
        <!-- League switcher: just the league glyph + a chevron (no name - it would
             crowd the scope toggle and action icons in the narrow dock). The
             tooltip names the current league; the dropdown lists full names. -->
        <div class="relative shrink-0">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            :aria-label="t('chat.league.switch')"
            v-tooltip.bottom="selectedLeague?.name ?? t('chat.dock.title')"
            @click="leaguesOpen = !leaguesOpen"
          >
            <i class="pi pi-users text-xs" style="color: var(--p-primary-color)" />
            <i class="pi pi-chevron-down text-[10px] opacity-60" />
          </button>
          <div
            v-if="leaguesOpen"
            class="absolute start-0 top-7 z-10 w-56 rounded-lg border shadow-lg py-1 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('chat.league.title') }}</p>
            <button
              v-for="l in chatLeagues"
              :key="l.id"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-start hover:opacity-100 opacity-90"
              :class="{ 'font-bold': l.id === selectedLeagueId }"
              @click="switchLeague(l.id)"
            >
              <i class="pi pi-users text-xs" :style="l.id === selectedLeagueId ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
              <span class="flex-1 truncate">{{ l.name }}</span>
              <span v-if="activity.hasUnreadInLeague(l.id)" class="w-2 h-2 shrink-0 rounded-full" style="background: var(--ng-danger)" />
              <i v-if="l.id === selectedLeagueId" class="pi pi-check text-xs" style="color: var(--p-primary-color)" />
            </button>
          </div>
        </div>
        <div v-if="matchId" class="flex items-center shrink-0 rounded-lg overflow-hidden text-xs" style="border: 1px solid var(--p-content-border-color)">
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

        <!-- Rooms with activity: jump to whichever room has unread. -->
        <div class="relative ms-auto">
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
            class="absolute end-0 top-7 z-10 w-64 rounded-lg border shadow-lg py-1 text-sm"
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
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:opacity-100 opacity-90 text-start"
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
        <ChatPanel :league-id="leagueId" :match-id="scopedMatchId" :match-label="scopedMatchId ? matchLabel(scopedMatchId) : ''" flat :tall="expanded" :active="enabled && !collapsed" @update:enabled="enabled = $event" @update:readable="panelReadable = $event" />
      </div>
    </div>
  </div>
</template>
