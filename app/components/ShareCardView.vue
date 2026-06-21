<script setup lang="ts">
interface ShareCard {
  state: 'result' | 'live' | 'reveal' | 'sealed'
  ownerName: string
  competitionName: string
  roundLabel: string
  group: string | null
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  predHome: number | null
  predAway: number | null
  actualHome: number | null
  actualAway: number | null
  pensHome: number | null
  pensAway: number | null
  tier: string | null
  totalPoints: number | null
  isJoker: boolean
  crowdSharePct: number | null
}

const props = defineProps<{ card: ShareCard; competitionSlug?: string | null }>()
const { t } = useI18n()

// Brand-consistent with the OG image (the ticket stub), but live HTML: themed
// text, real flags, team links, no raster scaling.
const TIER_COLOR: Record<string, string> = { EXACT: '#22c55e', DIFF: '#3b82f6', OUTCOME: '#eab308', MISS: '#64748b' }

const c = computed(() => props.card)
function code(side: 'home' | 'away') {
  const v = side === 'home' ? c.value.homeTeamCode : c.value.awayTeamCode
  const team = side === 'home' ? c.value.homeTeam : c.value.awayTeam
  return v ?? team.slice(0, 3).toUpperCase()
}
function teamLink(side: 'home' | 'away') {
  const tc = side === 'home' ? c.value.homeTeamCode : c.value.awayTeamCode
  return props.competitionSlug && tc ? `/${props.competitionSlug}/teams/${tc}` : undefined
}
const roundText = computed(() => {
  if (c.value.group) return c.value.group
  const n = c.value.roundLabel.toLowerCase()
  if (/round of 32|last 32/.test(n)) return t('bracket.round.r32')
  if (/round of 16|last 16/.test(n)) return t('bracket.round.r16')
  if (/quarter/.test(n)) return t('bracket.round.qf')
  if (/semi/.test(n)) return t('bracket.round.sf')
  if (/third/.test(n)) return t('bracket.round.third')
  if (/final/.test(n)) return t('bracket.round.final')
  return c.value.roundLabel
})
const predScore = computed(() => `${c.value.predHome ?? 0} - ${c.value.predAway ?? 0}`)
const actualScore = computed(() => `${c.value.actualHome ?? 0} - ${c.value.actualAway ?? 0}`)
</script>

<template>
  <div
    class="rounded-2xl p-5 sm:p-7 text-white shadow-lg flex flex-col gap-5"
    style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"
  >
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <img src="/brand/mark.svg" alt="" class="w-7 h-7" >
        <span class="font-bold text-lg">Nostragoalus</span>
      </div>
      <div class="flex flex-col items-end text-right leading-tight">
        <span class="text-sm" style="color: #a5b4fc">{{ c.competitionName }}</span>
        <span class="text-sm font-semibold" style="color: #818cf8">{{ roundText }}</span>
      </div>
    </header>

    <div class="flex items-center justify-between gap-2 sm:gap-4">
      <component :is="teamLink('home') ? 'NuxtLink' : 'div'" :to="teamLink('home')" class="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <img v-if="flagUrl(c.homeTeamCode)" :src="flagUrl(c.homeTeamCode) || ''" alt="" class="w-9 h-9 rounded object-cover" >
        <span class="px-3 py-1 rounded-xl text-2xl sm:text-4xl font-bold tracking-wide" style="background: rgba(255,255,255,0.07); border: 2px solid rgba(165,180,252,0.35)">{{ code('home') }}</span>
        <span class="text-xs sm:text-sm truncate max-w-full" style="color: #a5b4fc">{{ c.homeTeam }}</span>
      </component>

      <div class="flex flex-col items-center gap-1 shrink-0">
        <template v-if="c.state === 'result'">
          <span class="text-[10px] sm:text-xs uppercase tracking-widest" style="color: #a5b4fc">{{ t('share.card.fullTime') }}</span>
          <span class="text-4xl sm:text-6xl font-bold tabular-nums">{{ actualScore }}</span>
          <span v-if="c.pensHome != null && c.pensAway != null" class="text-xs" style="color: #a5b4fc">({{ c.pensHome }}-{{ c.pensAway }} {{ t('match.pens') }})</span>
        </template>
        <template v-else-if="c.state === 'sealed'">
          <span class="text-2xl sm:text-4xl font-bold">{{ t('share.card.sealed') }}</span>
          <span class="text-xs sm:text-sm" style="color: #a5b4fc">{{ t('share.card.sealedSub') }}</span>
        </template>
        <template v-else>
          <span class="text-[10px] sm:text-xs uppercase tracking-widest" style="color: #a5b4fc">{{ t('share.card.myCall') }}</span>
          <span class="text-4xl sm:text-6xl font-bold tabular-nums">{{ predScore }}</span>
        </template>
      </div>

      <component :is="teamLink('away') ? 'NuxtLink' : 'div'" :to="teamLink('away')" class="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <img v-if="flagUrl(c.awayTeamCode)" :src="flagUrl(c.awayTeamCode) || ''" alt="" class="w-9 h-9 rounded object-cover" >
        <span class="px-3 py-1 rounded-xl text-2xl sm:text-4xl font-bold tracking-wide" style="background: rgba(255,255,255,0.07); border: 2px solid rgba(165,180,252,0.35)">{{ code('away') }}</span>
        <span class="text-xs sm:text-sm truncate max-w-full" style="color: #a5b4fc">{{ c.awayTeam }}</span>
      </component>
    </div>

    <div class="flex flex-col items-center gap-2 min-h-[2rem]">
      <div v-if="c.state === 'result'" class="flex flex-wrap items-center justify-center gap-2">
        <span class="px-3 py-1 rounded-lg text-sm font-semibold" style="background: rgba(255,255,255,0.07)">{{ t('share.card.myCall') }} {{ predScore }}</span>
        <span v-if="c.tier" class="px-3 py-1 rounded-lg text-sm font-bold" :style="{ background: TIER_COLOR[c.tier] ?? '#64748b' }">{{ tierLabel(c.tier, t) }}</span>
        <span class="px-3 py-1 rounded-lg text-sm font-bold" style="background: #818cf8; color: #1e1b4b">+{{ c.totalPoints ?? 0 }} {{ t('share.card.pts') }}</span>
        <span v-if="c.isJoker" class="px-3 py-1 rounded-lg text-sm font-bold" style="background: #7c3aed">{{ t('share.card.joker') }}</span>
      </div>
      <p v-if="c.state === 'result' && c.crowdSharePct != null" class="text-sm text-center" style="color: #a5b4fc">{{ t('share.card.rarity', { pct: c.crowdSharePct }) }}</p>
      <span v-else-if="c.state === 'reveal'" class="px-3 py-1 rounded-lg text-sm" style="background: rgba(255,255,255,0.07); color: #a5b4fc">{{ t('share.card.kickoffSoon') }}</span>
      <span v-else-if="c.state === 'live'" class="px-3 py-1 rounded-lg text-sm font-bold" style="background: #ef4444">{{ t('share.card.kickedOff') }}</span>
    </div>

    <footer class="flex items-end justify-between gap-3 text-sm">
      <span style="color: #a5b4fc">{{ t('share.card.tagline') }}</span>
      <span class="font-semibold shrink-0">{{ c.ownerName }}</span>
    </footer>
  </div>
</template>
