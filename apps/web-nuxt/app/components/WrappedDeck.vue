<script setup lang="ts">
import type { WrappedDto, WrappedPickDto } from '#shared/types/wrapped'
import { REACTION_GLYPHS } from '#shared/reactions'
import { buildSlides, journeyFinishRank, journeyPolyline, type WrappedSlideType } from '../utils/wrapped-slides'
import { flagUrl, tierLabel } from '../utils/format'

const props = defineProps<{ wrapped: WrappedDto }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const slides = computed<WrappedSlideType[]>(() => buildSlides(props.wrapped))
const index = ref(0)
const current = computed(() => slides.value[index.value] ?? 'summary')
const isLast = computed(() => index.value >= slides.value.length - 1)

function next() {
  if (!isLast.value) index.value += 1
}
function prev() {
  if (index.value > 0) index.value -= 1
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' || e.key === ' ') next()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Swipe: a horizontal drag past the threshold turns the page.
let touchX = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0]?.clientX ?? 0
}
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX
  if (Math.abs(dx) < 40) return
  if (dx < 0) next()
  else prev()
}

// One saturated gradient per slide type: the deck changes mood as it advances.
const GRADIENTS: Record<WrappedSlideType, string> = {
  intro: 'linear-gradient(160deg, #1e1b4b, #4338ca)',
  totals: 'linear-gradient(160deg, #052e16, #15803d)',
  tiers: 'linear-gradient(160deg, #172554, #1d4ed8)',
  bestPick: 'linear-gradient(160deg, #431407, #ea580c)',
  biggestMiss: 'linear-gradient(160deg, #450a0a, #b91c1c)',
  jokers: 'linear-gradient(160deg, #3b0764, #9333ea)',
  journey: 'linear-gradient(160deg, #082f49, #0284c7)',
  crowd: 'linear-gradient(160deg, #422006, #ca8a04)',
  meta: 'linear-gradient(160deg, #14532d, #16a34a)',
  chat: 'linear-gradient(160deg, #500724, #db2777)',
  haul: 'linear-gradient(160deg, #451a03, #d97706)',
  summary: 'linear-gradient(160deg, #1e1b4b, #7c3aed)',
}

const score = (p: WrappedPickDto) => `${p.predHome}-${p.predAway}`
const actual = (p: WrappedPickDto) => (p.actualHome !== null && p.actualAway !== null ? `${p.actualHome}-${p.actualAway}` : null)
const polyline = computed(() => journeyPolyline(props.wrapped.journey))
const topEmojiGlyph = computed(() =>
  props.wrapped.chat.topEmoji ? REACTION_GLYPHS[props.wrapped.chat.topEmoji] : null,
)
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col text-white select-none"
    :style="`background:${GRADIENTS[current]}; transition: background 0.5s ease`"
    data-test="wrapped-deck"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- progress segments -->
    <div class="flex gap-1 px-3 pt-3">
      <div
        v-for="(s, i) in slides"
        :key="s"
        class="h-1 flex-1 rounded-full transition"
        :style="`background: rgba(255,255,255,${i <= index ? 0.95 : 0.3})`"
      />
    </div>

    <button
      type="button"
      class="absolute top-6 end-3 z-10 w-9 h-9 rounded-full bg-black/30 text-white flex items-center justify-center"
      :aria-label="t('wrapped.close')"
      data-test="wrapped-close"
      @click="emit('close')"
    >
      <i class="pi pi-times" />
    </button>

    <!-- tap zones -->
    <button type="button" class="absolute inset-y-0 start-0 w-1/3 z-[5] cursor-w-resize" :aria-label="t('wrapped.prev')" data-test="wrapped-prev" @click="prev" />
    <button type="button" class="absolute inset-y-0 end-0 w-2/3 z-[5] cursor-e-resize" :aria-label="t('wrapped.next')" data-test="wrapped-next" @click="next" />

    <Transition name="wrapped-slide" mode="out-in">
      <div :key="current" class="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4 overflow-hidden" :data-test="`wrapped-slide-${current}`">
        <!-- intro -->
        <template v-if="current === 'intro'">
          <img v-if="wrapped.image" :src="wrapped.image" class="w-20 h-20 rounded-full shadow-lg" alt="">
          <h1 class="text-3xl font-extrabold leading-tight">{{ t('wrapped.introTitle', { name: wrapped.displayName }) }}</h1>
          <p class="text-lg opacity-80">{{ t('wrapped.introSub', { competition: wrapped.competitionName }) }}</p>
          <p class="text-sm opacity-60">{{ t('wrapped.tapHint') }}</p>
        </template>

        <!-- totals -->
        <template v-else-if="current === 'totals'">
          <p class="text-lg opacity-80">{{ t('wrapped.totalsLead') }}</p>
          <div class="text-7xl font-black tabular-nums">{{ wrapped.totals.totalPoints }}</div>
          <p class="text-xl font-semibold">{{ t('wrapped.totalsPoints') }}</p>
          <p v-if="wrapped.totals.rank" class="text-lg opacity-90">
            {{ t('wrapped.totalsRank', { rank: wrapped.totals.rank, players: wrapped.totals.players }) }}
          </p>
          <p v-if="wrapped.totals.topPercent" class="text-2xl font-bold">
            {{ t('wrapped.topPercent', { pct: wrapped.totals.topPercent }) }}
          </p>
        </template>

        <!-- tiers -->
        <template v-else-if="current === 'tiers'">
          <p class="text-lg opacity-80">{{ t('wrapped.tiersLead', { n: wrapped.tiers.predictions }) }}</p>
          <div class="grid grid-cols-2 gap-3 w-full max-w-xs">
            <div class="rounded-xl bg-white/15 p-4"><div class="text-4xl font-black">{{ wrapped.tiers.exact }}</div><div class="text-sm opacity-80">{{ t('wrapped.tiersExact') }}</div></div>
            <div class="rounded-xl bg-white/15 p-4"><div class="text-4xl font-black">{{ wrapped.tiers.diff }}</div><div class="text-sm opacity-80">{{ t('wrapped.tiersDiff') }}</div></div>
            <div class="rounded-xl bg-white/15 p-4"><div class="text-4xl font-black">{{ wrapped.tiers.outcome }}</div><div class="text-sm opacity-80">{{ t('wrapped.tiersOutcome') }}</div></div>
            <div class="rounded-xl bg-white/15 p-4"><div class="text-4xl font-black">{{ wrapped.tiers.miss }}</div><div class="text-sm opacity-80">{{ t('wrapped.tiersMiss') }}</div></div>
          </div>
          <p v-if="wrapped.streaks.scoringStreak > 1" class="text-base opacity-90">
            {{ t('wrapped.tiersStreak', { n: wrapped.streaks.scoringStreak }) }}
          </p>
          <p class="text-sm opacity-70">{{ t('wrapped.tiersCompletion', { pct: wrapped.tiers.completionPct }) }}</p>
        </template>

        <!-- best pick -->
        <template v-else-if="current === 'bestPick' && wrapped.bestPick">
          <p class="text-lg opacity-80">{{ t('wrapped.bestPickLead') }}</p>
          <div class="flex items-center gap-3 text-xl font-bold">
            <img v-if="flagUrl(wrapped.bestPick.homeTeamCode)" :src="flagUrl(wrapped.bestPick.homeTeamCode)!" class="w-8 h-8 rounded" alt="">
            {{ wrapped.bestPick.homeTeam }} - {{ wrapped.bestPick.awayTeam }}
            <img v-if="flagUrl(wrapped.bestPick.awayTeamCode)" :src="flagUrl(wrapped.bestPick.awayTeamCode)!" class="w-8 h-8 rounded" alt="">
          </div>
          <div class="text-6xl font-black tabular-nums">{{ score(wrapped.bestPick) }}</div>
          <p class="text-xl font-semibold">+{{ wrapped.bestPick.totalPoints }} {{ t('wrapped.pts') }}
            <span v-if="wrapped.bestPick.isJoker" class="ms-1">🃏</span>
          </p>
          <p v-if="wrapped.bestPick.tier" class="text-base opacity-90">{{ tierLabel(wrapped.bestPick.tier, t) }}</p>
          <p v-if="wrapped.bestPick.crowdSharePct !== null" class="text-sm opacity-70">
            {{ t('wrapped.bestPickCrowd', { pct: wrapped.bestPick.crowdSharePct }) }}
          </p>
        </template>

        <!-- biggest miss -->
        <template v-else-if="current === 'biggestMiss' && wrapped.biggestMiss">
          <p class="text-lg opacity-80">{{ t('wrapped.missLead') }}</p>
          <div class="text-xl font-bold">{{ wrapped.biggestMiss.homeTeam }} - {{ wrapped.biggestMiss.awayTeam }}</div>
          <p class="text-base opacity-90">
            {{ t('wrapped.missCalled', { score: score(wrapped.biggestMiss) }) }}
            <template v-if="actual(wrapped.biggestMiss)"> {{ t('wrapped.missActual', { score: actual(wrapped.biggestMiss)! }) }}</template>
          </p>
          <div class="text-5xl font-black">{{ wrapped.biggestMiss.fieldExactPct }}%</div>
          <p class="text-base opacity-90">{{ t('wrapped.missField') }}</p>
        </template>

        <!-- jokers -->
        <template v-else-if="current === 'jokers'">
          <p class="text-lg opacity-80">{{ t('wrapped.jokerLead') }}</p>
          <div class="text-7xl">🃏</div>
          <p class="text-xl font-semibold">{{ t('wrapped.jokerPlayed', { n: wrapped.jokers.played }) }}</p>
          <div class="text-5xl font-black tabular-nums">+{{ wrapped.jokers.points }} {{ t('wrapped.pts') }}</div>
          <p v-if="wrapped.jokers.best && wrapped.jokers.best.totalPoints > 0" class="text-base opacity-90">
            {{ t('wrapped.jokerBest', { home: wrapped.jokers.best.homeTeam, away: wrapped.jokers.best.awayTeam, points: wrapped.jokers.best.totalPoints }) }}
          </p>
        </template>

        <!-- journey -->
        <template v-else-if="current === 'journey'">
          <p class="text-lg opacity-80">{{ t('wrapped.journeyLead') }}</p>
          <svg viewBox="0 0 100 100" class="w-full max-w-sm h-40" preserveAspectRatio="none" aria-hidden="true">
            <polyline :points="polyline" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <p class="text-xl font-semibold">
            {{ t('wrapped.journeyEnd', { rank: journeyFinishRank(wrapped) }) }}
          </p>
          <p class="text-sm opacity-70">
            {{ t('wrapped.journeyBest', { rank: Math.min(...wrapped.journey.map((p) => p.rank)) }) }}
          </p>
        </template>

        <!-- crowd -->
        <template v-else-if="current === 'crowd'">
          <p class="text-lg opacity-80">{{ t('wrapped.crowdLead') }}</p>
          <div class="text-6xl font-black tabular-nums">+{{ wrapped.crowd.bonusPoints }}</div>
          <p class="text-xl font-semibold">{{ t('wrapped.crowdBonus') }}</p>
          <p v-if="wrapped.crowd.biggestBonus" class="text-base opacity-90">
            {{ t('wrapped.crowdBiggest', { home: wrapped.crowd.biggestBonus.homeTeam, away: wrapped.crowd.biggestBonus.awayTeam, points: wrapped.crowd.biggestBonus.bonusPoints }) }}
          </p>
          <p v-if="wrapped.crowd.loneWolf > 0" class="text-lg font-semibold">🐺 {{ t('wrapped.loneWolf', { n: wrapped.crowd.loneWolf }) }}</p>
        </template>

        <!-- meta picks -->
        <template v-else-if="current === 'meta'">
          <p class="text-lg opacity-80">{{ t('wrapped.metaLead') }}</p>
          <div v-if="wrapped.meta.champion" class="rounded-xl bg-white/15 p-4 w-full max-w-xs flex items-center gap-3">
            <img v-if="flagUrl(wrapped.meta.champion.teamCode)" :src="flagUrl(wrapped.meta.champion.teamCode)!" class="w-10 h-10 rounded" alt="">
            <div class="text-start">
              <div class="font-bold">{{ wrapped.meta.champion.teamName }}</div>
              <div class="text-sm opacity-80">
                {{ wrapped.meta.champion.hit ? t('wrapped.metaChampionHit', { points: wrapped.meta.champion.points }) : t('wrapped.metaChampionMiss') }}
              </div>
            </div>
          </div>
          <div v-if="wrapped.meta.bestScorer" class="rounded-xl bg-white/15 p-4 w-full max-w-xs flex items-center gap-3">
            <div class="text-3xl">⚽</div>
            <div class="text-start">
              <div class="font-bold">{{ wrapped.meta.bestScorer.playerName }}</div>
              <div class="text-sm opacity-80">
                {{ wrapped.meta.bestScorer.hit ? t('wrapped.metaScorerHit', { points: wrapped.meta.bestScorer.points }) : t('wrapped.metaScorerMiss') }}
              </div>
            </div>
          </div>
        </template>

        <!-- chat -->
        <template v-else-if="current === 'chat'">
          <p class="text-lg opacity-80">{{ t('wrapped.chatLead') }}</p>
          <div class="text-6xl font-black tabular-nums">{{ wrapped.chat.messages }}</div>
          <p class="text-xl font-semibold">{{ t('wrapped.chatMessages') }}</p>
          <p class="text-base opacity-90">{{ t('wrapped.chatReactions', { given: wrapped.chat.reactionsGiven, received: wrapped.chat.reactionsReceived }) }}</p>
          <p v-if="topEmojiGlyph" class="text-lg">{{ t('wrapped.chatTopEmoji') }} <span class="text-3xl align-middle">{{ topEmojiGlyph }}</span></p>
        </template>

        <!-- haul -->
        <template v-else-if="current === 'haul'">
          <p class="text-lg opacity-80">{{ t('wrapped.haulLead') }}</p>
          <div v-if="wrapped.haul.trophies.length" class="text-5xl">🏆</div>
          <p v-if="wrapped.haul.trophies.length" class="text-xl font-semibold">
            {{ t('wrapped.haulTrophies', { n: wrapped.haul.trophies.length }) }}
          </p>
          <div class="flex flex-wrap justify-center gap-2 max-w-xs">
            <span v-for="tr in wrapped.haul.trophies" :key="tr.type" class="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
              {{ t(`achievements.trophy.${tr.type === 'TEAM_SPECIALIST' && !tr.teamCode ? 'TEAM_SPECIALIST_GENERIC' : tr.type}.name`, { team: tr.teamCode ?? '' }) }}
            </span>
          </div>
          <p class="text-xl font-semibold">{{ t('wrapped.haulBadges', { n: wrapped.haul.badges.length }) }}</p>
        </template>

        <!-- summary -->
        <template v-else-if="current === 'summary'">
          <h2 class="text-2xl font-extrabold">{{ t('wrapped.summaryTitle') }}</h2>
          <div class="grid grid-cols-2 gap-3 w-full max-w-xs text-start">
            <div class="rounded-xl bg-white/15 p-3"><div class="text-2xl font-black">{{ wrapped.totals.totalPoints }}</div><div class="text-xs opacity-80">{{ t('wrapped.totalsPoints') }}</div></div>
            <div class="rounded-xl bg-white/15 p-3"><div class="text-2xl font-black">{{ wrapped.totals.rank ?? '-' }}</div><div class="text-xs opacity-80">{{ t('wrapped.summaryRank') }}</div></div>
            <div class="rounded-xl bg-white/15 p-3"><div class="text-2xl font-black">{{ wrapped.tiers.exact }}</div><div class="text-xs opacity-80">{{ t('wrapped.tiersExact') }}</div></div>
            <div class="rounded-xl bg-white/15 p-3"><div class="text-2xl font-black">{{ wrapped.haul.trophies.length + wrapped.haul.badges.length }}</div><div class="text-xs opacity-80">{{ t('wrapped.summaryHaul') }}</div></div>
          </div>
          <!-- Lift the share CTAs above the full-height prev/next tap zones (z-5),
               or a tap on Download/Copy just advances the deck instead. -->
          <div class="relative z-10 flex flex-col items-center gap-3 w-full">
            <slot name="summary-actions" />
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.wrapped-slide-enter-active,
.wrapped-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.wrapped-slide-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.wrapped-slide-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
</style>
