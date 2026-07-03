<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { BOT_PERSONA_META, type BotPersonaParam } from '#shared/types/bot'
const { t } = useI18n()
useHead({ title: t('leaderboard.title') })
const slug = useSelectedCompetition()
const { league, leagueId } = useSelectedLeague()

// Standings move while matches are live (provisional points). The server nudges
// every client with scores:changed on each score poll - refetch the board then,
// so the live points and the ranking stay current over the WebSocket (no poll).
const qc = useQueryClient()
useReconnectingSocket({
  onMessage: (data) => {
    if ((data as { type?: string })?.type === 'scores:changed') qc.invalidateQueries({ queryKey: ['leaderboard'] })
  },
})

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
const { data: hiddenCount } = useLeaderboardHiddenCount(scopedLeagueId)
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

// The wrapped banner only shows once the final is decided (ready: true).
const { data: wrappedData } = useWrapped(() => !!meId.value)
const wrappedReady = computed(() => wrappedData.value?.ready === true)

// Short fixed label for the league scope: the pill already names the league,
// and the full name overflowed the header next to the bot controls.
const scopeOptions = computed(() => [
  ...(league.value ? [{ label: t('leaderboard.leagueScope'), value: 'league' as const }] : []),
  { label: t('leaderboard.thisCompetition'), value: 'competition' as const },
  { label: t('leaderboard.global'), value: 'global' as const },
])

// Display-only ghost rows at their would-be rank, enabled from one "Bots"
// popover. They follow the board scope but have no global identity
// (jokers/finals/champion are per-competition), so they hide in the global view.
// The crowd bots (consensus, equalizer) are for everyone; the evil twin here is
// your OWN picks swapped, so it needs a signed-in viewer and links to your
// profile - the fuller per-player twin lives there.
const enabledPersonas = useBotPersonas()
const botMethod = useBotMethod()
const botMenu = ref()
function togglePersona(persona: BotPersonaParam, on: boolean) {
  enabledPersonas.value = on
    ? [...enabledPersonas.value.filter((p) => p !== persona), persona]
    : enabledPersonas.value.filter((p) => p !== persona)
}
const consensusOn = computed(() => !isGlobal.value && enabledPersonas.value.includes('consensus'))
const evilOn = computed(() => !isGlobal.value && !!meId.value && enabledPersonas.value.includes('evil-twin'))
const equalizerOn = computed(() => !isGlobal.value && enabledPersonas.value.includes('equalizer'))
const { data: consensusBot } = useBotRow('consensus', consensusOn, botMethod, scopedLeagueId)
const { data: evilBot } = useBotRow('evil-twin', evilOn, botMethod, scopedLeagueId)
const { data: equalizerBot } = useBotRow('equalizer', equalizerOn, botMethod, scopedLeagueId)
// Count of enabled bots, for the trigger's badge.
const activeBotCount = computed(() => [consensusOn.value, evilOn.value, equalizerOn.value].filter(Boolean).length)

const methodOptions = computed(() => [
  { label: t('bot.methodMode'), value: 'mode' },
  { label: t('bot.methodMean'), value: 'mean' },
])
// Only the crowd bot (consensus) has a MODE/MEAN choice; below the population
// threshold only MEAN is meaningful, so the choice hides and the server forces
// MEAN. Mirror that in the control.
const modeAvailable = computed(() => consensusBot.value?.modeAvailable ?? false)
watchEffect(() => {
  if (consensusOn.value && !modeAvailable.value && botMethod.value === 'mode') botMethod.value = 'mean'
})

type DisplayRow = LeaderboardRow & {
  movement?: number | null
  isBot?: boolean
  persona?: BotPersonaParam
  icon?: string
}
const ghostRows = computed<DisplayRow[]>(() => {
  const sources = [
    { persona: 'consensus' as const, on: consensusOn.value, payload: consensusBot.value },
    { persona: 'evil-twin' as const, on: evilOn.value, payload: evilBot.value },
    { persona: 'equalizer' as const, on: equalizerOn.value, payload: equalizerBot.value },
  ]
  return sources
    .filter((s) => s.on && s.payload?.row && s.payload.row.rank !== null)
    .map((s) => ({
      ...s.payload!.row!,
      rank: s.payload!.row!.rank as number,
      persona: s.persona,
      icon: BOT_PERSONA_META[s.persona].icon,
      displayName: t(BOT_PERSONA_META[s.persona].nameKey),
      image: null,
      livePoints: 0,
      movement: null,
      isBot: true,
      showcase: [],
    }))
})
const displayRows = computed<DisplayRow[]>(() => {
  const base: DisplayRow[] = rows.value ?? []
  return ghostRows.value.length ? insertGhostRows(base, ghostRows.value) : base
})

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}

// A ghost row links to its bot page; the evil-twin ghost is your own, so it goes
// to your profile with the twin already open (its fuller home).
function rowLink(r: DisplayRow) {
  if (!r.isBot) return `/${slug.value}/users/${r.userId}${isGlobal.value ? '?global=1' : ''}`
  if (r.persona === 'evil-twin') return `/${slug.value}/users/${meId.value}?twin=1`
  return `/${slug.value}/bot?persona=${r.persona}${scopedLeagueId.value ? `&league=${scopedLeagueId.value}` : ''}`
}

// Any provisional points = at least one match is live and counting.
const hasLive = computed(() => displayRows.value.some((r) => r.livePoints))
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-2xl font-bold">{{ t('leaderboard.title') }}</h1>
        <i
          v-tooltip.top="t('leaderboard.tiebreakHint')"
          class="pi pi-info-circle cursor-help text-sm"
          style="color: var(--p-text-muted-color)"
        />
        <span v-if="hasLive" class="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full" style="color: #fff; background: var(--ng-danger)">
          <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{{ t('leaderboard.liveProvisional') }}
        </span>
        <CompetitionPill />
        <LeaguePill />
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <template v-if="!isGlobal">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            :style="`border-color: var(--p-content-border-color); background: var(--p-content-background); color: ${activeBotCount ? 'var(--p-primary-color)' : 'var(--p-text-color)'}`"
            @click="(e) => botMenu.toggle(e)"
          >
            <span>🤖</span>{{ t('bot.showBots') }}
            <span v-if="activeBotCount" class="text-[10px] font-bold px-1.5 rounded-full" style="color: #fff; background: var(--p-primary-color)">{{ activeBotCount }}</span>
            <i class="pi pi-chevron-down text-xs opacity-60" />
          </button>
          <Popover ref="botMenu">
            <div class="flex flex-col w-64 -m-1 py-1">
              <button type="button" class="px-3 py-2 text-sm text-start flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10" @click="togglePersona('consensus', !consensusOn)">
                <i class="pi" :class="consensusOn ? 'pi-check-square' : 'pi-stop'" :style="consensusOn ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
                <span class="flex-1">🤖 {{ t('bot.persona.consensus') }}</span>
              </button>
              <div v-if="consensusOn" class="px-3 pb-2">
                <SelectButton v-if="modeAvailable" v-model="botMethod" :options="methodOptions" option-label="label" option-value="value" :allow-empty="false" size="small" class="w-full ng-bot-method" />
                <span v-else class="text-xs" style="color: var(--p-text-muted-color)">{{ t('bot.modeDisabled') }}</span>
              </div>
              <button v-if="meId" type="button" class="px-3 py-2 text-sm text-start flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10" @click="togglePersona('evil-twin', !evilOn)">
                <i class="pi" :class="evilOn ? 'pi-check-square' : 'pi-stop'" :style="evilOn ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
                <span class="flex-1">😈 {{ t('bot.persona.evilTwin') }}</span>
              </button>
              <button type="button" class="px-3 py-2 text-sm text-start flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10" @click="togglePersona('equalizer', !equalizerOn)">
                <i class="pi" :class="equalizerOn ? 'pi-check-square' : 'pi-stop'" :style="equalizerOn ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
                <span class="flex-1">⚖️ {{ t('bot.persona.equalizer') }}</span>
              </button>
            </div>
          </Popover>
        </template>
        <SelectButton v-model="scope" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
      </div>
    </div>
    <!-- Post-final: the recap banner invites everyone into their Wrapped. -->
    <NuxtLink
      v-if="wrappedReady"
      :to="`/${slug}/wrapped`"
      class="flex items-center gap-3 rounded-xl p-4 mb-5 text-white no-underline"
      style="background: linear-gradient(120deg, #4338ca, #7c3aed)"
      data-test="wrapped-banner"
    >
      <span class="text-3xl">🎉</span>
      <span class="flex-1">
        <span class="block font-bold">{{ t('wrapped.bannerTitle') }}</span>
        <span class="block text-sm opacity-90">{{ t('wrapped.bannerBody') }}</span>
      </span>
      <i class="pi pi-arrow-right rtl:rotate-180" />
    </NuxtLink>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!displayRows.length" class="opacity-60">{{ t('leaderboard.empty') }}</div>

    <div v-else class="flex flex-col gap-2">
      <NuxtLink
        v-for="r in displayRows"
        :key="r.userId"
        :to="rowLink(r)"
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
        <span v-if="r.isBot" class="shrink-0 text-2xl leading-none w-8 h-8 inline-flex items-center justify-center">{{ r.icon }}</span>
        <UserAvatar v-else :image="r.image" :user-id="r.userId" />
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
              <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-12deg)"><GoldenBoot /></span>
            </span>
            <ShowcaseIcons :items="r.showcase" />
            <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
          </div>
          <div class="text-xs" style="color: var(--p-text-muted-color)">
            {{ r.exactCount }} {{ t('leaderboard.exact') }} · {{ r.outcomeCount }} {{ t('leaderboard.correct') }}<template v-if="r.championPoints"> · 👑 +{{ r.championPoints }}</template><template v-if="r.bestScorerPoints"> · <GoldenBoot /> +{{ r.bestScorerPoints }}</template>
          </div>
        </div>
        <div class="text-end shrink-0">
          <div>
            <span class="text-xl font-bold tabular-nums">{{ r.totalPoints }}</span>
            <span class="text-xs ms-1" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
          </div>
          <div v-if="r.livePoints" v-tooltip.left="t('leaderboard.livePointsHint')" class="text-[10px] font-bold leading-none tabular-nums" style="color: var(--ng-danger)">+{{ r.livePoints }} {{ t('leaderboard.live') }}</div>
        </div>
        <i class="pi pi-angle-right text-xs shrink-0" style="color: var(--p-text-muted-color)" />
      </NuxtLink>
      <div
        v-if="hiddenCount"
        v-tooltip.top="{ value: t('leaderboard.hiddenTip'), pt: { text: 'text-xs max-w-64' } }"
        class="flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-2 text-xs cursor-help"
        style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
      >
        <i class="pi pi-eye-slash" style="font-size: 0.7rem" />
        {{ t('leaderboard.hidden', { n: hiddenCount }, hiddenCount) }}
        <i class="pi pi-info-circle" style="font-size: 0.7rem; opacity: 0.6" />
      </div>
    </div>
  </div>
</template>
