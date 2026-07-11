<script setup lang="ts">
import { cabinetPath, chatMentionPath, type NotificationDTO } from '#shared/types/notifications'
import { DEFAULT_COMPETITION } from '#shared/competition'
import { dmPath } from '#shared/types/dm'

const { t, locale } = useI18n()
const router = useRouter()
const { notifications, unreadCount, isLoading, markRead, markAllRead, dismiss, deleteAll } = useNotifications()
const dmDock = useDmDockOpen()

// One uniform row shape drives the panel, so the template is a single list with no
// per-kind branch. Every notification maps to a row, except DM rows (already one
// per thread server-side) which collapse into a single grouped row: a busy inbox
// is one line whose click opens the lone thread, or the DM inbox when it spans
// several. `open`/`dismiss` are pre-bound here so the template just calls them.
type DmData = Extract<NotificationDTO['data'], { type: 'DM_MESSAGE' }>
interface BellRow {
  key: string
  unread: boolean
  icon: string
  text: string
  createdAt: string
  open: () => void
  dismiss: () => void
}

const rows = computed<BellRow[]>(() => {
  const list = notifications.value
  const dms = list.filter((n) => n.data.type === 'DM_MESSAGE')
  const grouped = dms.length > 1
  const out: BellRow[] = []
  let placedGroup = false
  for (const n of list) {
    // Collapse the DM rows into one grouped row, dropped in at the newest DM's slot
    // (the list is newest-first) so the overall order is kept.
    if (grouped && n.data.type === 'DM_MESSAGE') {
      if (placedGroup) continue
      placedGroup = true
      const ids = dms.map((d) => d.id)
      const threads = [...new Set(dms.map((d) => (d.data as DmData).threadId))]
      out.push({
        key: 'dm-group',
        unread: dms.some((d) => !d.read),
        icon: 'pi pi-envelope',
        text: t('notifications.item.dmGroup', { count: threads.length }),
        createdAt: dms[0]!.createdAt,
        open: () => {
          markRead.mutate(ids)
          panel.value?.hide?.()
          // One conversation -> open it; several -> the inbox so the user picks.
          openDm(threads.length === 1 ? threads[0]! : null)
        },
        dismiss: () => dismiss.mutate(ids),
      })
      continue
    }
    out.push({
      key: n.id,
      unread: !n.read,
      icon: ICONS[n.type],
      text: itemText(n),
      createdAt: n.createdAt,
      open: () => onItem(n),
      dismiss: () => dismiss.mutate([n.id]),
    })
  }
  return out
})

const panel = ref()
const { onShow, onHide } = useHideOnScroll(panel)
function toggle(e: Event) {
  panel.value?.toggle(e)
}
// Opening the panel is the acknowledgement: clear the unread badge right away.
// The list stays until the user wipes it with "delete all" or dismisses items.
function onPanelShow() {
  onShow()
  if (unreadCount.value > 0) markAllRead.mutate()
}

const ICONS: Record<NotificationDTO['type'], string> = {
  LEAGUE_JOIN: 'pi pi-user-plus',
  LEAGUE_ROLE: 'pi pi-shield',
  LEAGUE_REMOVED: 'pi pi-user-minus',
  PICK_REMINDER: 'pi pi-clock',
  MATCH_RESULT: 'pi pi-flag',
  CHAMPION_RESULT: 'pi pi-crown',
  BEST_SCORER_RESULT: 'pi pi-star',
  TROPHY_AWARDED: 'pi pi-trophy',
  ACHIEVEMENT_UNLOCKED: 'pi pi-verified',
  CHAT_MENTION: 'pi pi-at',
  DM_MESSAGE: 'pi pi-envelope',
  VOICE_MISSED: 'pi pi-phone',
}

function itemText(n: NotificationDTO): string {
  const d = n.data
  switch (d.type) {
    case 'LEAGUE_JOIN':
      return t('notifications.item.leagueJoin', { name: d.joinerName, league: d.leagueName })
    case 'LEAGUE_ROLE':
      return t(d.role === 'OWNER' ? 'notifications.item.leagueRoleOwner' : 'notifications.item.leagueRolePromoted', {
        league: d.leagueName,
      })
    case 'LEAGUE_REMOVED':
      return t('notifications.item.leagueRemoved', { league: d.leagueName })
    case 'PICK_REMINDER':
      return t('notifications.item.pickReminder', { home: d.homeTeam, away: d.awayTeam })
    case 'MATCH_RESULT':
      return t(d.points > 0 ? 'notifications.item.matchResult' : 'notifications.item.matchResultMiss', {
        home: d.homeTeam,
        away: d.awayTeam,
        hs: d.homeScore,
        as: d.awayScore,
        points: d.points,
      })
    case 'CHAMPION_RESULT':
      return t(d.won ? 'notifications.item.championWon' : 'notifications.item.championLost', {
        team: d.teamName,
        competition: d.competitionName,
        points: d.points,
      })
    case 'BEST_SCORER_RESULT':
      return t(d.won ? 'notifications.item.bestScorerWon' : 'notifications.item.bestScorerLost', {
        player: d.playerName,
        competition: d.competitionName,
        points: d.points,
      })
    case 'TROPHY_AWARDED': {
      const trophy =
        d.trophyType === 'TEAM_SPECIALIST'
          ? d.teamName
            ? t('achievements.trophy.TEAM_SPECIALIST.name', { team: d.teamName })
            : t('achievements.trophy.TEAM_SPECIALIST_GENERIC.name')
          : t(`achievements.trophy.${d.trophyType}.name`)
      return t('notifications.item.trophyAwarded', { trophy, competition: d.competitionName })
    }
    case 'ACHIEVEMENT_UNLOCKED':
      return t('notifications.item.achievementUnlocked', { achievement: t(`achievements.badge.${d.key}.name`) })
    case 'CHAT_MENTION':
      return d.matchId
        ? t('notifications.item.mentionMatch', { name: d.senderName, home: d.homeTeam ?? '', away: d.awayTeam ?? '' })
        : t('notifications.item.mention', { name: d.senderName, league: d.leagueName })
    case 'DM_MESSAGE':
      return t('notifications.item.dm', { name: d.senderName })
    case 'VOICE_MISSED':
      return d.leagueId
        ? t('notifications.item.voiceMissedLeague', { name: d.callerName, league: d.leagueName ?? '' })
        : t('notifications.item.voiceMissed', { name: d.callerName })
  }
}

function linkFor(n: NotificationDTO): string {
  const d = n.data
  switch (d.type) {
    case 'LEAGUE_JOIN':
    case 'LEAGUE_ROLE':
      return `/leagues/${d.leagueId}`
    case 'LEAGUE_REMOVED':
      return '/leagues'
    case 'PICK_REMINDER':
    case 'MATCH_RESULT':
      return `/${d.competitionSlug}/matches/${d.matchId}`
    case 'CHAMPION_RESULT':
    case 'BEST_SCORER_RESULT':
      return `/${d.competitionSlug}/leaderboard`
    case 'TROPHY_AWARDED':
    case 'ACHIEVEMENT_UNLOCKED':
      return cabinetPath(d)
    case 'CHAT_MENTION':
      return chatMentionPath(d)
    case 'DM_MESSAGE':
      return dmPath(d.threadId)
    case 'VOICE_MISSED':
      return d.threadId
        ? dmPath(d.threadId)
        : chatMentionPath({
            competitionSlug: d.competitionSlug ?? DEFAULT_COMPETITION,
            leagueId: d.leagueId ?? '',
            matchId: d.matchId,
          })
  }
}

// Intl has no Klingon locale; fall back to English for the relative label only.
function timeAgo(iso: string): string {
  const loc = locale.value === 'tlh' ? 'en' : locale.value
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' })
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
  const hr = Math.round(min / 60)
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
  return rtf.format(-Math.round(hr / 24), 'day')
}

// Open a DM in place via the dock store rather than router.push(dmPath): the dock
// is already mounted, so navigating to /?dm=... would only change the query and
// leave the user on the current page without opening the thread.
function openDm(threadId: string | null) {
  if (threadId) dmDock.requestThread(threadId)
  else dmDock.requestInbox()
}

async function onItem(n: NotificationDTO) {
  if (!n.read) markRead.mutate([n.id])
  panel.value?.hide?.()
  if (n.data.type === 'DM_MESSAGE') {
    openDm(n.data.threadId)
    return
  }
  await router.push(linkFor(n))
}
</script>

<template>
  <ClientOnly>
    <button
      type="button"
      data-tour="notifications"
      class="relative rounded-full shrink-0 w-9 h-9 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
      :aria-label="t('notifications.ariaLabel')"
      @click="toggle"
    >
      <i class="pi pi-bell text-lg" />
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
        style="background: var(--ng-danger, #ef4444)"
      >{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>
    <Popover ref="panel" @show="onPanelShow" @hide="onHide">
      <div class="w-80 max-w-[90vw] -m-1">
        <div
          class="flex items-center justify-between px-3 py-2 border-b"
          style="border-color: var(--p-content-border-color)"
        >
          <span class="font-semibold text-sm">{{ t('notifications.title') }}</span>
          <button
            v-if="notifications.length > 0"
            type="button"
            class="text-xs hover:underline"
            style="color: var(--p-primary-color)"
            @click="deleteAll.mutate()"
          >
            {{ t('notifications.deleteAll') }}
          </button>
        </div>
        <div class="max-h-96 overflow-y-auto">
          <div
            v-if="isLoading"
            class="px-3 py-6 text-center text-sm"
            style="color: var(--p-text-muted-color)"
          >
            {{ t('notifications.loading') }}
          </div>
          <div
            v-else-if="notifications.length === 0"
            class="px-3 py-6 text-center text-sm"
            style="color: var(--p-text-muted-color)"
          >
            {{ t('notifications.empty') }}
          </div>
          <div
            v-for="row in rows"
            :key="row.key"
            class="relative flex items-stretch border-b last:border-b-0 hover:bg-black/5 dark:hover:bg-white/10 transition"
            style="border-color: var(--p-content-border-color)"
            :style="row.unread ? 'background: color-mix(in srgb, var(--p-primary-color) 7%, transparent)' : ''"
          >
            <button
              type="button"
              class="flex-1 min-w-0 text-start px-3 py-2.5 pe-8 flex items-start gap-2.5"
              @click="row.open()"
            >
              <i :class="row.icon" class="mt-0.5" :style="row.unread ? 'color: var(--p-primary-color)' : ''" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm leading-snug">{{ row.text }}</span>
                <span class="block text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ timeAgo(row.createdAt) }}</span>
              </span>
            </button>
            <button
              type="button"
              class="absolute top-1.5 end-1.5 w-6 h-6 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15 transition"
              :aria-label="t('notifications.dismiss')"
              @click="row.dismiss()"
            >
              <i class="pi pi-times text-xs" />
            </button>
          </div>
        </div>
      </div>
    </Popover>
  </ClientOnly>
</template>
