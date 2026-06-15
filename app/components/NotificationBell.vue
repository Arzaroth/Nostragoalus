<script setup lang="ts">
import type { NotificationDTO } from '../../shared/types/notifications'

const { t, locale } = useI18n()
const router = useRouter()
const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications()

const panel = ref()
function toggle(e: Event) {
  panel.value?.toggle(e)
}

const ICONS: Record<NotificationDTO['type'], string> = {
  LEAGUE_JOIN: 'pi pi-user-plus',
  LEAGUE_ROLE: 'pi pi-shield',
  LEAGUE_REMOVED: 'pi pi-user-minus',
  MATCH_RESULT: 'pi pi-flag',
  CHAMPION_RESULT: 'pi pi-crown',
  BEST_SCORER_RESULT: 'pi pi-star',
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
    case 'MATCH_RESULT':
      return `/${d.competitionSlug}/matches/${d.matchId}`
    case 'CHAMPION_RESULT':
    case 'BEST_SCORER_RESULT':
      return `/${d.competitionSlug}/leaderboard`
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

async function onItem(n: NotificationDTO) {
  if (!n.read) markRead.mutate([n.id])
  panel.value?.hide?.()
  await router.push(linkFor(n))
}
</script>

<template>
  <ClientOnly>
    <button
      type="button"
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
    <Popover ref="panel">
      <div class="w-80 max-w-[90vw] -m-1">
        <div
          class="flex items-center justify-between px-3 py-2 border-b"
          style="border-color: var(--p-content-border-color)"
        >
          <span class="font-semibold text-sm">{{ t('notifications.title') }}</span>
          <button
            v-if="unreadCount > 0"
            type="button"
            class="text-xs hover:underline"
            style="color: var(--p-primary-color)"
            @click="markAllRead.mutate()"
          >
            {{ t('notifications.markAllRead') }}
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
          <button
            v-for="n in notifications"
            :key="n.id"
            type="button"
            class="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-black/5 dark:hover:bg-white/10 transition border-b last:border-b-0"
            style="border-color: var(--p-content-border-color)"
            :style="
              n.read ? '' : 'background: color-mix(in srgb, var(--p-primary-color) 7%, transparent)'
            "
            @click="onItem(n)"
          >
            <i :class="ICONS[n.type]" class="mt-0.5" :style="n.read ? '' : 'color: var(--p-primary-color)'" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm leading-snug">{{ itemText(n) }}</span>
              <span class="block text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ timeAgo(n.createdAt) }}</span>
            </span>
            <span
              v-if="!n.read"
              class="mt-1.5 w-2 h-2 rounded-full shrink-0"
              style="background: var(--p-primary-color)"
            />
          </button>
        </div>
      </div>
    </Popover>
  </ClientOnly>
</template>
