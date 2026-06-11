<script setup lang="ts">
const { t } = useI18n()
const slug = useSelectedCompetition()
const { league, leagueId } = useSelectedLeague()

// Three scopes once a league is picked in the pill; the pill decides WHICH
// league, this toggle decides how wide the ranking is.
const scope = ref<'league' | 'competition' | 'global'>(leagueId.value ? 'league' : 'competition')
watch(leagueId, (id) => {
  if (id) scope.value = 'league'
  else if (scope.value === 'league') scope.value = 'competition'
})

const isGlobal = computed(() => scope.value === 'global')
const scopedLeagueId = computed(() => (scope.value === 'league' ? leagueId.value : null))
const { data: rows, isLoading, error: boardError } = useLeaderboard(isGlobal, scopedLeagueId)
// The selected league was deleted, or membership was revoked: its board 404s.
// Drop the stale selection so the view falls back to the competition board
// instead of showing a misleading "empty leaderboard".
watch(boardError, (err) => {
  if (err && scope.value === 'league' && (err as { statusCode?: number }).statusCode === 404) {
    leagueId.value = null
  }
})
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id)

// Short fixed label for the league scope: the pill already names the league,
// and the full name overflowed the header next to the bot controls.
const scopeOptions = computed(() => [
  ...(league.value ? [{ label: t('leaderboard.leagueScope'), value: 'league' as const }] : []),
  { label: t('leaderboard.thisCompetition'), value: 'competition' as const },
  { label: t('leaderboard.global'), value: 'global' as const },
])

// The bot follows the board's scope - competition-wide or league members
// only - but has no global identity (joker rounds, finals and champion picks
// are competition-scoped), so the toggle disappears in the global view.
const showBot = ref(false)
const botMethod = useBotMethod()
const botEnabled = computed(() => showBot.value && !isGlobal.value)
const { data: bot } = useBotRow(botEnabled, botMethod, scopedLeagueId)
// Both methods always selectable; below the population threshold only MEAN is
// meaningful, so the toggle is hidden then (no greyed-out disabled option).
const methodOptions = computed(() => [
  { label: t('bot.methodMode'), value: 'mode' },
  { label: t('bot.methodMean'), value: 'mean' },
])
// The server enforces the population gate; mirror it in the control.
watchEffect(() => {
  if (bot.value && !bot.value.modeAvailable && botMethod.value === 'mode') botMethod.value = 'mean'
})

type DisplayRow = LeaderboardRow & { movement?: number | null; isBot?: boolean }
const displayRows = computed<DisplayRow[]>(() => {
  const base: DisplayRow[] = rows.value ?? []
  const row = bot.value?.row
  if (!botEnabled.value || !row || row.rank === null) return base
  return insertGhostRow(base, {
    ...row,
    rank: row.rank,
    displayName: t('bot.name'),
    image: null,
    movement: null,
    isBot: true,
  })
})

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-2xl font-bold">{{ t('leaderboard.title') }}</h1>
        <CompetitionPill />
        <LeaguePill />
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <template v-if="!isGlobal">
          <ToggleButton v-model="showBot" :on-label="t('bot.show')" :off-label="t('bot.show')" on-icon="pi pi-eye" off-icon="pi pi-eye-slash" size="small" />
          <SelectButton v-if="showBot && bot?.modeAvailable" v-model="botMethod" :options="methodOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
          <i
            v-if="showBot && bot && !bot.modeAvailable"
            v-tooltip.top="t('bot.modeDisabled')"
            class="pi pi-info-circle cursor-help"
            style="color: var(--p-text-muted-color)"
          />
        </template>
        <SelectButton v-model="scope" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
      </div>
    </div>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!displayRows.length" class="opacity-60">{{ t('leaderboard.empty') }}</div>

    <div v-else class="flex flex-col gap-2">
      <NuxtLink
        v-for="r in displayRows"
        :key="r.userId"
        :to="r.isBot ? `/${slug}/bot${scopedLeagueId ? `?league=${scopedLeagueId}` : ''}` : `/${slug}/users/${r.userId}${isGlobal ? '?global=1' : ''}`"
        class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
        :style="`background: var(--p-content-background); border-style: ${r.isBot ? 'dashed' : 'solid'}; opacity: ${r.isBot ? '0.85' : '1'}; border-color: ${r.userId === meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === meId ? '2px' : '1px'}`"
      >
        <div class="w-8 text-center shrink-0">
          <div class="font-bold tabular-nums text-lg leading-tight">
            <span v-if="medal(r.rank)">{{ medal(r.rank) }}</span>
            <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
          </div>
          <div v-if="r.movement" class="text-[10px] font-bold leading-none" :style="`color: ${r.movement > 0 ? 'var(--ng-success)' : 'var(--ng-danger)'}`">
            {{ r.movement > 0 ? '▲' : '▼' }}{{ Math.abs(r.movement) }}
          </div>
        </div>
        <span v-if="r.isBot" class="shrink-0 text-2xl leading-none w-8 h-8 inline-flex items-center justify-center">🤖</span>
        <UserAvatar v-else :image="r.image" />
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate flex items-center gap-2.5">
            <span class="truncate">{{ r.displayName }}</span>
            <span v-if="r.isBot" class="text-xs font-normal px-1.5 py-0.5 rounded-full" style="color: var(--p-text-muted-color); background: var(--p-content-border-color)">{{ t('bot.virtual') }}</span>
            <span v-if="r.championCode && flagUrl(r.championCode)" v-tooltip.top="`${t('champion.tag')}: ${r.championName ?? r.championCode}`" class="relative shrink-0 inline-flex">
              <img :src="flagUrl(r.championCode) || ''" class="w-4 h-4 rounded object-cover" alt="" >
              <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-25deg)">👑</span>
            </span>
            <span v-if="r.bestScorerCode && flagUrl(r.bestScorerCode)" v-tooltip.top="`${t('bestScorer.tag')}: ${r.bestScorerName ? formatPlayerName(r.bestScorerName) : r.bestScorerCode}`" class="relative shrink-0 inline-flex">
              <img :src="flagUrl(r.bestScorerCode) || ''" class="w-4 h-4 rounded object-cover" alt="" >
              <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-12deg)">👟</span>
            </span>
            <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
          </div>
          <div class="text-xs" style="color: var(--p-text-muted-color)">
            {{ r.exactCount }} {{ t('leaderboard.exact') }} · {{ r.outcomeCount }} {{ t('leaderboard.correct') }}<template v-if="r.championPoints"> · 👑 +{{ r.championPoints }}</template><template v-if="r.bestScorerPoints"> · 👟 +{{ r.bestScorerPoints }}</template>
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="text-xl font-bold tabular-nums">{{ r.totalPoints }}</span>
          <span class="text-xs ml-1" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
        </div>
        <i class="pi pi-angle-right text-xs shrink-0" style="color: var(--p-text-muted-color)" />
      </NuxtLink>
    </div>
  </div>
</template>
