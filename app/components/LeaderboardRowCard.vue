<script setup lang="ts">
import type { LeaderboardDisplayRow } from '../composables/useLeaderboard'

// One leaderboard row, shared by the competition board and the per-league board
// so they never drift. Everything is driven off the row data: the crown, boot,
// movement arrow and live points render only when their fields are present, and
// the bot decoration (dashed border, icon, "virtual" tag) only when isBot is set
// - a plain league row leaves them all inert. The link target differs per board
// (bots, global flag), so the parent computes it and passes `to`.
const props = defineProps<{
  row: LeaderboardDisplayRow
  to: string
  meId?: string
}>()
const { t } = useI18n()

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
const isMe = computed(() => props.row.userId === props.meId)
</script>

<template>
  <NuxtLink
    :to="to"
    data-test="leaderboard-row"
    class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
    :style="`background: var(--p-content-background); border-style: ${row.isBot ? 'dashed' : 'solid'}; opacity: ${row.isBot ? '0.85' : '1'}; border-color: ${isMe ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${isMe ? '2px' : '1px'}`"
  >
    <div class="w-8 text-center shrink-0">
      <div class="font-bold tabular-nums text-lg leading-tight">
        <span v-if="medal(row.rank)">{{ medal(row.rank) }}</span>
        <span v-else style="color: var(--p-text-muted-color)">{{ row.rank }}</span>
      </div>
      <div v-if="row.movement" class="text-[10px] font-bold leading-none" :style="`color: ${row.movement > 0 ? 'var(--ng-success)' : 'var(--ng-danger)'}`">
        {{ row.movement > 0 ? '▲' : '▼' }}{{ Math.abs(row.movement) }}
      </div>
    </div>
    <span v-if="row.isBot" class="shrink-0 text-2xl leading-none w-8 h-8 inline-flex items-center justify-center">{{ row.icon }}</span>
    <UserAvatar v-else :image="row.image" :user-id="row.userId" />
    <div class="flex-1 min-w-0">
      <div class="font-semibold truncate flex items-center gap-2.5">
        <span class="truncate">{{ row.displayName }}</span>
        <span v-if="row.isBot" class="text-xs font-normal px-1.5 py-0.5 rounded-full" style="color: var(--p-text-muted-color); background: var(--p-content-border-color)">{{ t('bot.virtual') }}</span>
        <span v-if="row.championCode && flagUrl(row.championCode)" v-tooltip.top="`${t('champion.tag')}: ${row.championName ?? row.championCode}`" class="relative shrink-0 inline-flex">
          <img :src="flagUrl(row.championCode) || ''" class="w-4 h-4 rounded object-cover" alt="" >
          <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-25deg)">👑</span>
        </span>
        <span v-if="row.bestScorerCode && flagUrl(row.bestScorerCode)" v-tooltip.top="`${t('bestScorer.tag')}: ${row.bestScorerName ? formatPlayerName(row.bestScorerName) : row.bestScorerCode}`" class="relative shrink-0 inline-flex">
          <img :src="flagUrl(row.bestScorerCode) || ''" class="w-4 h-4 rounded object-cover" alt="" >
          <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-12deg)"><GoldenBoot /></span>
        </span>
        <ShowcaseIcons :items="row.showcase" />
        <span v-if="isMe" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
      </div>
      <div class="text-xs" style="color: var(--p-text-muted-color)">
        {{ row.exactCount }} {{ t('leaderboard.exact') }} · {{ row.outcomeCount }} {{ t('leaderboard.correct') }}<template v-if="row.championPoints"> · 👑 +{{ row.championPoints }}</template><template v-if="row.bestScorerPoints"> · <GoldenBoot /> +{{ row.bestScorerPoints }}</template>
      </div>
    </div>
    <div class="text-end shrink-0">
      <div>
        <span class="text-xl font-bold tabular-nums">{{ row.totalPoints }}</span>
        <span class="text-xs ms-1" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
      </div>
      <div v-if="row.livePoints" v-tooltip.left="t('leaderboard.livePointsHint')" class="text-[10px] font-bold leading-none tabular-nums" style="color: var(--ng-danger)">+{{ row.livePoints }} {{ t('leaderboard.live') }}</div>
    </div>
    <i class="pi pi-angle-right text-xs shrink-0" style="color: var(--p-text-muted-color)" />
  </NuxtLink>
</template>
