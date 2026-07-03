<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const slug = useSelectedCompetition()
const global = computed({
  get: () => route.query.global === '1',
  set: (v: boolean) => router.replace({ query: { ...route.query, global: v ? '1' : undefined } }),
})
const scopeOptions = computed(() => [
  { label: t('leaderboard.thisCompetition'), value: false },
  { label: t('leaderboard.global'), value: true },
])
const { data, error } = await useFetch<{
  user: { id: string; name: string; image: string | null }
  champion: { teamCode: string | null; teamName: string; awardedPoints: number } | null
  bestScorer: { teamCode: string | null; teamName: string; playerName: string; awardedPoints: number } | null
  predictions: (MyPrediction & { competitionSlug?: string })[]
  adminView?: boolean
}>(`/api/users/${route.params.id}/predictions`, {
  query: computed(() => ({ competition: global.value ? 'global' : (slug.value ?? undefined) })),
})

// Split picks at "now": played (kicked-off) above, any still-upcoming below.
// Only admins ever receive upcoming rows (picks stay private until kickoff), so
// the split is admin-only: everyone else gets every returned pick as played,
// and the anchor simply sits after the last one. Gating on `adminView` (not the
// client clock) also keeps a just-kicked-off pick from being misfiled under the
// admin-only divider when a viewer's clock lags the server.
const now = Date.now()
const kickedOff = computed(() => {
  const all = data.value?.predictions ?? []
  return data.value?.adminView ? all.filter((p) => new Date(p.kickoffTime).getTime() <= now) : all
})
const upcoming = computed(() =>
  data.value?.adminView ? (data.value.predictions ?? []).filter((p) => new Date(p.kickoffTime).getTime() > now) : [],
)

// A profile fills with played rows as the tournament runs, so the top is rarely
// the useful spot. On load, center the "now" boundary so the latest action is in
// view, mirroring the fixtures page's jump-to-next. Skipped when nothing has
// kicked off yet (nothing to scroll past) or when the URL already targets an
// anchor. onMounted is client-only, so this never runs during SSR.
const nowAnchor = ref<HTMLElement | null>(null)
onMounted(() => {
  if (route.hash || !kickedOff.value.length) return
  void nextTick(() => nowAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
})

// This player's evil twin: their own picks with every score swapped. No global
// identity (jokers/champion are per-competition), so it's competition-scope only.
const userId = computed(() => String(route.params.id))
// ?twin=1 (e.g. from the leaderboard's own-twin ghost) opens straight into it.
const twinOn = ref(route.query.twin === '1')
const twinCompetition = computed(() => (global.value ? null : (slug.value ?? null)))
const twinEnabled = computed(() => twinOn.value && !global.value)
const { data: twin } = useUserEvilTwin(userId, twinCompetition, twinEnabled)
const showTwin = computed(() => twinEnabled.value && !!twin.value)
</script>

<template>
  <div v-if="data">
    <NuxtLink :to="`/${slug}/leaderboard`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('leaderboard.title') }}
    </NuxtLink>
    <div class="flex items-center justify-between gap-3 flex-wrap mt-3 mb-1">
      <div class="flex items-center gap-3 min-w-0">
        <UserAvatar :image="data.user.image" :user-id="data.user.id" size="large" />
        <h1 class="text-2xl font-bold truncate">{{ data.user.name }}</h1>
        <span v-if="data.champion?.teamCode && flagUrl(data.champion.teamCode)" v-tooltip.top="`${t('champion.tag')}: ${data.champion.teamName}`" class="relative shrink-0 inline-flex items-center gap-1.5">
          <img :src="flagUrl(data.champion.teamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="absolute -top-2.5 -left-2 text-sm" style="transform: rotate(-25deg)">👑</span>
          <span v-if="data.champion.awardedPoints" class="text-xs font-semibold" style="color: var(--ng-star)">+{{ data.champion.awardedPoints }} pts</span>
        </span>
        <span v-if="data.bestScorer?.teamCode && flagUrl(data.bestScorer.teamCode)" v-tooltip.top="`${t('bestScorer.tag')}: ${formatPlayerName(data.bestScorer.playerName)}`" class="relative shrink-0 inline-flex items-center gap-1.5">
          <img :src="flagUrl(data.bestScorer.teamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="absolute -top-2.5 -left-2 text-sm" style="transform: rotate(-12deg)"><GoldenBoot /></span>
          <span v-if="data.bestScorer.awardedPoints" class="text-xs font-semibold" style="color: var(--ng-star)">+{{ data.bestScorer.awardedPoints }} pts</span>
        </span>
        <CompetitionPill v-if="!global" />
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <ToggleButton
          v-if="!global"
          v-model="twinOn"
          :on-label="`😈 ${t('bot.evilTwin')}`"
          :off-label="`😈 ${t('bot.evilTwin')}`"
          size="small"
          v-tooltip.top="t('bot.evilTwinNote')"
        />
        <SelectButton v-model="global" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
      </div>
    </div>

    <template v-if="showTwin && twin">
      <p class="text-sm mb-1 flex items-center gap-2 flex-wrap" style="color: var(--p-text-muted-color)">
        <span>😈 {{ t('bot.evilTwinNote') }}</span>
      </p>
      <div class="flex items-center gap-2 flex-wrap text-sm mb-4" style="color: var(--p-text-muted-color)">
        <span v-if="twin.summary.rank" class="font-semibold" style="color: var(--p-text-color)">{{ t('bot.twinWouldRank', { rank: twin.summary.rank }) }}</span>
        <span class="font-semibold" style="color: var(--p-text-color)">{{ twin.summary.totalPoints }} {{ t('leaderboard.pts') }}</span>
        <span>· {{ twin.summary.exactCount }} {{ t('leaderboard.exact') }}</span>
        <span>· {{ twin.summary.outcomeCount }} {{ t('leaderboard.correct') }}</span>
        <span
          v-if="twin.subject"
          class="ms-1 px-2 py-0.5 rounded-full font-medium"
          style="color: var(--p-primary-color); background: var(--p-highlight-background, var(--p-content-border-color))"
        >{{ t('bot.twinVs', { name: data.user.name, rank: twin.subject.rank, points: twin.subject.totalPoints }) }}</span>
      </div>
      <PredictionList :predictions="twin.predictions" />
      <div v-if="!twin.predictions.length" class="opacity-60">{{ t('bot.empty') }}</div>
    </template>

    <template v-else>
      <p class="text-sm mb-5" style="color: var(--p-text-muted-color)">{{ t('predictions.publicNote') }}</p>
      <PredictionList :predictions="kickedOff" />
      <!-- The "now" boundary: played picks above, still-upcoming (admin-only) below.
           Also the scroll anchor centered on load. Invisible when there's nothing
           upcoming to introduce. -->
      <div ref="nowAnchor" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem)">
        <div v-if="upcoming.length" class="flex items-center gap-3 my-4 text-xs font-semibold" style="color: var(--p-text-muted-color)">
          <span class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
          <span class="inline-flex items-center gap-1.5"><i class="pi pi-eye-slash" />{{ t('predictions.adminUpcomingDivider') }}</span>
          <span class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
        </div>
      </div>
      <PredictionList v-if="upcoming.length" :predictions="upcoming" />
      <div v-if="!data.predictions.length" class="opacity-60">{{ t('predictions.none') }}</div>
      <TrophyCabinet v-if="!global" :user-id="data.user.id" />
    </template>
  </div>
  <!-- Unknown user or a private profile the viewer doesn't share a league with. -->
  <div v-else-if="error" class="opacity-60">{{ t('err.notFound') }}</div>
</template>
