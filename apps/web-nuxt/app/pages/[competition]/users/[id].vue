<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const toast = useToast()
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
  user: { id: string; name: string; image: string | null; canMessage: boolean }
  champion: { teamCode: string | null; teamName: string; awardedPoints: number } | null
  bestScorer: { teamCode: string | null; teamName: string; playerName: string; awardedPoints: number } | null
  predictions: (MyPrediction & { competitionSlug?: string })[]
  adminView?: boolean
}>(`/api/users/${route.params.id}/predictions`, {
  query: computed(() => ({ competition: global.value ? 'global' : (slug.value ?? undefined) })),
})

// Start a direct message with this user: hand the id to the dock (which opens the
// Direct tab and starts the thread). Signed-in viewers only, and not on your own
// profile.
const { session } = useAuth()
const dmOpen = useDmOpen()
// Only when signed in, not your own profile, and the target has set up chat (else
// they cannot receive an E2E-encrypted DM).
const canMessage = computed(
  () => !!session.value?.data?.user && session.value.data.user.id !== data.value?.user.id && !!data.value?.user.canMessage,
)

// Your own profile: mint a signed share card and copy its public link. The token
// names only you, and the /p/ landing renders without a login, so it unfurls when
// sent to friends. Competition-scoped (the card brags about one tournament).
const isSelf = computed(() => !!session.value?.data?.user && session.value.data.user.id === data.value?.user.id)
// Compare this player against yourself, competition-scoped (jokers/champion are
// per-competition, so the head-to-head only makes sense within one tournament).
const canCompare = computed(() => !!session.value?.data?.user && !isSelf.value && !global.value && !!data.value)
const sharing = ref(false)
async function shareProfile() {
  sharing.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/share/profile-mint', {
      method: 'POST',
      body: { competition: slug.value ?? undefined, locale: locale.value },
    })
    if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(res.url)
    toast.add({ severity: 'success', summary: t('share.copied'), life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: t('share.failed'), life: 2500 })
  } finally {
    sharing.value = false
  }
}

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

const nowAnchor = ref<HTMLElement | null>(null)

// This player's evil twin: their own picks with every score swapped. No global
// identity (jokers/champion are per-competition), so it's competition-scope only.
const userId = computed(() => String(route.params.id))
// ?twin=1 (e.g. from the leaderboard's own-twin ghost) opens straight into it.
const twinOn = ref(route.query.twin === '1')
const twinCompetition = computed(() => (global.value ? null : (slug.value ?? null)))
const twinEnabled = computed(() => twinOn.value && !global.value)
const { data: twin } = useUserEvilTwin(userId, twinCompetition, twinEnabled)
const { skin } = useSkin()
const showTwin = computed(() => twinEnabled.value && !!twin.value)

// One scroll decision, once, after the page mounts and profile data resolves -
// the target sections only exist then. Two landings compete: a #cabinet deep-link
// (the "my achievements" menu item and an ACHIEVEMENT_UNLOCKED notification) and
// the default jump-to-now. The anchor wins; otherwise center the "now" boundary
// so the latest action is in view (skipped when nothing has kicked off yet).
//
// A single latch means the two never fight. The intended anchor is read from
// route.hash FIRST, then window.location.hash: on an in-app nav (the "my
// achievements" menu item) route.hash is set at once while the URL/hash reconciles
// a tick late, and mid-hydration it is the reverse - window.location.hash leads.
// Trusting route.hash-then-URL covers both orderings, so neither lets the default
// jump-to-now fire on a stale-empty hash and steal the one-shot before the anchor.
// route.hash also stays in the deps so a same-route hash-only nav retriggers.
const pageMounted = useMounted()
let scrolled = false
watch(
  [() => !!data.value, pageMounted, () => route.hash],
  async () => {
    if (scrolled || !pageMounted.value || !data.value) return
    await nextTick()
    const hash = route.hash || (typeof window !== 'undefined' ? window.location.hash : '')
    if (hash === '#cabinet') {
      const el = document.getElementById('cabinet')
      if (!el) return
      scrolled = true
      // Router's own hash scroll fired before this section existed and ignores its
      // scroll-margin-top; scrollIntoView honors it.
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (!hash && kickedOff.value.length) {
      scrolled = true
      nowAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  },
  { immediate: true, flush: 'post' },
)
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
        <Button v-if="canMessage" size="small" outlined icon="pi pi-send" :label="t('dm.message')" @click="dmOpen.requestDm(data.user.id)" />
        <NuxtLink v-if="canCompare" :to="`/${slug}/compare?a=me&b=${data.user.id}`">
          <Button size="small" outlined icon="pi pi-arrows-h" :label="t('h2h.compare')" data-test="compare-link" />
        </NuxtLink>
        <Button
          v-if="isSelf && !global"
          size="small"
          outlined
          icon="pi pi-share-alt"
          :label="t('share.shareProfile')"
          :loading="sharing"
          data-test="share-profile"
          @click="shareProfile"
        />
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
        <img v-if="skin" src="/bots/chrysalis.png" class="w-6 h-6 rounded-full object-cover shrink-0" alt="" >
        <span v-else>😈</span>
        <span>{{ t('bot.evilTwinNote') }}</span>
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
