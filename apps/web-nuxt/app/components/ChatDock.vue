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
import type { DmRecipientDTO } from '#shared/types/dm'

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
    return `${dragStyle.value}; position: fixed; z-index: 50; width: ${expanded.value ? '40rem' : '24rem'}; height: 32rem; resize: both; overflow: hidden; ${base}`
  }
  return `width: ${expanded.value ? 'min(48rem, 94vw)' : '24rem'}; ${base}`
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

// --- Direct messages (the dock's second mode) ---
// DMs are global (not league scoped), so this mode is available to any signed-in
// user, even on a page with no league selected. The conversation list + recipient
// search live here; an open thread reuses ChatPanel in DM mode (full chat parity).
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data?.user)
const dm = useDmInbox()
const toast = useToast()
// League mode needs a resolved league; without one, only Direct is available.
const mode = ref<'league' | 'direct'>('league')
watch(
  leagueId,
  (l) => {
    if (!l) mode.value = 'direct'
  },
  { immediate: true },
)
const dmView = ref<'inbox' | 'thread' | 'new'>('inbox')
const dmThreadId = ref<string | null>(null)
const dmSearch = ref('')
const dmResults = ref<DmRecipientDTO[]>([])
let dmSearchTimer: ReturnType<typeof setTimeout> | undefined

const dmThread = computed(() => (dm.threads.data.value ?? []).find((t) => t.threadId === dmThreadId.value) ?? null)

async function openDock() {
  collapsed.value = false
  if (mode.value === 'direct') await dm.ensureIdentity()
}
function switchMode(m: 'league' | 'direct') {
  mode.value = m
  if (m === 'direct') {
    void dm.ensureIdentity()
    if (dmView.value === 'thread' && !dmThreadId.value) dmView.value = 'inbox'
  }
}

async function openDmThread(threadId: string) {
  dmThreadId.value = threadId
  dmView.value = 'thread'
  dm.markRead.mutate(threadId)
}
function dmBackToInbox() {
  dmView.value = 'inbox'
  dmThreadId.value = null
}
function openDmNew() {
  dmView.value = 'new'
  dmSearch.value = ''
  dmResults.value = []
  void dm.searchRecipients('').then((r) => (dmResults.value = r))
}
watch(dmSearch, (q) => {
  clearTimeout(dmSearchTimer)
  dmSearchTimer = setTimeout(async () => {
    dmResults.value = await dm.searchRecipients(q.trim())
  }, 250)
})
async function pickDmRecipient(r: DmRecipientDTO) {
  const threadId = await dm.startThread.mutateAsync(r.userId)
  await openDmThread(threadId)
}
function dmInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

// A DM deep link (push, or a fresh load): /?dm=<threadId> opens the dock straight
// to Direct mode on that conversation. A watch (not onMounted) so a push click
// while the app is already open - which only changes the query, not the route -
// still opens the thread. (route is already declared above.)
watch(
  () => route.query.dm,
  (wanted) => {
    if (typeof wanted === 'string' && wanted && signedIn.value) {
      collapsed.value = false
      switchMode('direct')
      void openDmThread(wanted)
    }
  },
  { immediate: true },
)

// The DM bell entry (in-app) asks the dock to open Direct mode in place: a
// specific thread, or the inbox when a grouped notification spans several. No
// navigation, so it opens even though the dock is already mounted.
const dmDock = useDmDockOpen()
watch(dmDock.requestOpen, () => {
  const want = dmDock.take()
  if (!want || !signedIn.value) return
  collapsed.value = false
  switchMode('direct')
  if (want.threadId) void openDmThread(want.threadId)
  else dmBackToInbox()
})

// A "Message" button elsewhere (a profile page) asks the dock to open a DM with a
// user: switch to Direct, start/open the thread, uncollapse.
const dmOpen = useDmOpen()
watch(
  dmOpen.requestOpen,
  async () => {
    const userId = dmOpen.take()
    if (!userId || !signedIn.value) return
    collapsed.value = false
    switchMode('direct')
    try {
      const threadId = await dm.startThread.mutateAsync(userId)
      await openDmThread(threadId)
    } catch {
      // The recipient never set up chat (e.g. a bot), so they can't be DMed - tell
      // the user instead of silently landing on the inbox.
      dmView.value = 'inbox'
      toast.add({ severity: 'warn', summary: t('dm.cantMessage'), life: 4000 })
    }
  },
  { immediate: true },
)

// The bubble badge sums league activity and DM unread so one number covers both.
const bubbleTotal = computed(() => activity.total.value + dm.totalUnread.value)
</script>

<template>
  <div v-if="signedIn" class="fixed bottom-4 right-4 z-40 flex flex-col items-end" style="max-width: 92vw">
    <!-- Collapsed: the messaging bubble (league chat + DMs), badged with unread. -->
    <button
      v-show="collapsed"
      type="button"
      data-tour="chat"
      class="relative rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
      :aria-label="t('chat.dock.open')"
      @click="openDock"
    >
      <i class="pi pi-comments text-xl" />
      <span
        v-if="bubbleTotal"
        class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center tabular-nums"
        style="background: var(--ng-danger); color: #fff"
      >{{ bubbleTotal > 99 ? '99+' : bubbleTotal }}</span>
      <!-- Unread @mentions get their own badge (distinct colour), still counted in
           the global total above. -->
      <span
        v-if="activity.totalMentions.value"
        v-tooltip.left="activity.totalMentions.value === 1 ? t('chat.mention.unreadOne') : t('chat.mention.unread', { n: activity.totalMentions.value })"
        class="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center"
        style="background: var(--ng-star); color: #000"
      >@</span>
    </button>

    <!-- The window. Kept mounted while collapsed (v-show) to hold the socket. -->
    <div
      v-show="!collapsed"
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
        <!-- Mode toggle: one button that flips league chat <-> direct messages
             (compact, so the match-page header stays within the narrow dock). Only
             shown when a league chat is in reach; off a league, only Direct exists.
             The icon is the mode you'd switch TO. -->
        <button
          v-if="leagueId"
          type="button"
          class="relative shrink-0 inline-flex items-center rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
          v-tooltip.bottom="mode === 'league' ? t('dm.title') : t('chat.dock.title')"
          :aria-label="mode === 'league' ? t('dm.title') : t('chat.dock.title')"
          @click="switchMode(mode === 'league' ? 'direct' : 'league')"
        >
          <i :class="mode === 'league' ? 'pi pi-send' : 'pi pi-comments'" class="text-sm" style="color: var(--p-primary-color)" />
          <span v-if="mode === 'league' && dm.totalUnread.value" class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
        </button>

        <!-- League switcher: just the league glyph + a chevron (no name - it would
             crowd the scope toggle and action icons in the narrow dock). The
             tooltip names the current league; the dropdown lists full names. -->
        <div v-if="mode === 'league'" class="relative shrink-0">
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
        <div v-if="mode === 'league' && matchId" class="flex items-center shrink-0 rounded-lg overflow-hidden text-xs" style="border: 1px solid var(--p-content-border-color)">
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

        <!-- Direct-mode header: title + back/new. -->
        <template v-if="mode === 'direct'">
          <button v-if="dmView !== 'inbox'" type="button" class="opacity-70 hover:opacity-100 shrink-0" :aria-label="t('dm.back')" @click="dmBackToInbox">
            <i class="pi pi-arrow-left" />
          </button>
          <span class="font-semibold truncate">{{ dmView === 'thread' ? (dmThread?.other.name ?? '') : dmView === 'new' ? t('dm.new') : t('dm.title') }}</span>
          <button v-if="dmView === 'inbox'" type="button" class="ms-auto opacity-70 hover:opacity-100 shrink-0" :aria-label="t('dm.new')" @click="openDmNew">
            <i class="pi pi-pencil" />
          </button>
          <span v-else class="ms-auto" />
        </template>

        <!-- Rooms with activity: jump to whichever room has unread. -->
        <div v-if="mode === 'league'" class="relative ms-auto">
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

      <!-- League chat: kept mounted (v-show) so its socket + enabled state survive a
           mode switch; only rendered once a league is resolved. -->
      <div v-if="leagueId" v-show="mode === 'league'" class="p-3">
        <ChatPanel :league-id="leagueId" :match-id="scopedMatchId" :match-label="scopedMatchId ? matchLabel(scopedMatchId) : ''" flat :tall="expanded" :active="mode === 'league' && enabled && !collapsed" @update:enabled="enabled = $event" @update:readable="panelReadable = $event" />
      </div>

      <!-- Direct messages: an open thread reuses ChatPanel with the SAME natural
           sizing as league chat (it sizes itself via `tall`), so the two modes look
           consistent. The inbox + recipient search are fixed-height scroll lists. -->
      <template v-if="mode === 'direct'">
        <div v-if="dm.identityStatus.value === 'needs-restore'" class="p-4 text-sm" style="color: var(--p-text-muted-color)">{{ t('dm.needsRestore') }}</div>
        <div v-else-if="dmView === 'thread' && dmThreadId" class="p-3">
          <ChatPanel :key="dmThreadId" :dm-thread-id="dmThreadId ?? undefined" flat :tall="expanded" :active="!collapsed" />
        </div>
        <div v-else class="flex flex-col" :style="`height: ${expanded ? '34rem' : '28rem'}`">
          <template v-if="dmView === 'new'">
            <div class="p-3 shrink-0">
              <input v-model="dmSearch" type="text" class="w-full rounded-lg border px-3 py-2 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" :placeholder="t('dm.searchPlaceholder')" >
            </div>
            <div class="flex-1 overflow-y-auto">
              <p v-if="!dmResults.length" class="px-3 py-2 text-sm" style="color: var(--p-text-muted-color)">{{ t('dm.searchHint') }}</p>
              <button
                v-for="r in dmResults"
                :key="r.userId"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2 text-start hover:bg-black/5 dark:hover:bg-white/10"
                @click="pickDmRecipient(r)"
              >
                <img v-if="r.image" :src="r.image" class="w-8 h-8 rounded-full object-cover shrink-0" alt="" >
                <span v-else class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ dmInitial(r.name) }}</span>
                <span class="flex-1 truncate">{{ r.name }}</span>
                <span v-if="r.shared" class="text-xs px-1.5 py-0.5 rounded" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ t('dm.coMember') }}</span>
              </button>
            </div>
          </template>
          <div v-else class="flex-1 overflow-y-auto">
            <p v-if="!(dm.threads.data.value ?? []).length" class="p-4 text-sm" style="color: var(--p-text-muted-color)">{{ t('dm.empty') }}</p>
            <button
              v-for="th in dm.threads.data.value ?? []"
              :key="th.threadId"
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-black/5 dark:hover:bg-white/10"
              @click="openDmThread(th.threadId)"
            >
              <img v-if="th.other.image" :src="th.other.image" class="w-9 h-9 rounded-full object-cover shrink-0" alt="" >
              <span v-else class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ dmInitial(th.other.name) }}</span>
              <span class="flex-1 min-w-0 truncate font-medium">{{ th.other.name }}</span>
              <span v-if="th.unread" class="min-w-5 h-5 px-1 shrink-0 rounded-full text-xs font-bold flex items-center justify-center tabular-nums" style="background: var(--ng-danger); color: #fff">{{ th.unread > 99 ? '99+' : th.unread }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
