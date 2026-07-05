<script setup lang="ts">
// Public face of a league: rankings + join/leave. This is where non-members
// see a PUBLIC league's standings; private leagues 404 for outsiders.
const route = useRoute()
const { t } = useI18n()
const leagueId = computed<string | null>(() => (route.params.id as string) || null)
const detail = useLeagueDetail(leagueId)
const rows = useLeaderboard(ref(false), leagueId)
const hiddenCount = useLeaderboardHiddenCount(leagueId)
const { joinPublic, leave } = useLeagueActions()
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id)

const confirmLeave = ref(false)
const isMember = computed(() => !!detail.data.value?.league.role)
const canManage = computed(() => {
  const role = detail.data.value?.league.role
  return role === 'OWNER' || role === 'MODERATOR'
})

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
</script>

<template>
  <div>
    <NuxtLink to="/leagues" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('leagues.title') }}
    </NuxtLink>

    <div v-if="detail.isLoading.value" class="opacity-60 mt-4">{{ t('common.loading') }}</div>
    <div v-else-if="detail.isError.value" class="opacity-60 mt-4">{{ t('err.notFound') }}</div>
    <template v-else-if="detail.data.value">
      <div class="flex items-center justify-between gap-3 flex-wrap mt-3 mb-5">
        <div class="flex items-center gap-3 min-w-0 flex-wrap">
          <i class="pi pi-users text-xl" style="color: var(--p-primary-color)" />
          <h1 class="text-2xl font-bold truncate">{{ detail.data.value.league.name }}</h1>
          <Tag v-if="detail.data.value.league.visibility === 'PUBLIC'" :value="t('leagues.public')" severity="success" />
          <span class="text-sm" style="color: var(--p-text-muted-color)">
            {{ detail.data.value.league.competition?.name }} ·
            {{ t('leagues.memberCount', { n: detail.data.value.league.memberCount }, detail.data.value.league.memberCount) }}
          </span>
        </div>
        <Button
          v-if="!isMember"
          :label="t('leagues.joinPublic')"
          size="small"
          :loading="joinPublic.isPending.value"
          @click="joinPublic.mutate(leagueId!)"
        />
        <Button
          v-else-if="detail.data.value.league.role !== 'OWNER'"
          :label="t('leagues.leave')"
          severity="danger"
          outlined
          size="small"
          @click="confirmLeave = true"
        />
      </div>

      <div v-if="rows.isLoading.value" class="opacity-60">{{ t('common.loading') }}</div>
      <div v-else-if="!rows.data.value?.length" class="opacity-60">{{ t('leaderboard.empty') }}</div>
      <div v-else class="flex flex-col gap-2">
        <NuxtLink
          v-for="r in rows.data.value"
          :key="r.userId"
          :to="`/${detail.data.value.league.competition?.slug}/users/${r.userId}`"
          class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
          :style="`background: var(--p-content-background); border-color: ${r.userId === meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === meId ? '2px' : '1px'}`"
        >
          <div class="w-8 text-center shrink-0 font-bold tabular-nums text-lg">
            <span v-if="medal(r.rank)">{{ medal(r.rank) }}</span>
            <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
          </div>
          <UserAvatar :image="r.image" :user-id="r.userId" />
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate flex items-center gap-2">
              <span class="truncate">{{ r.displayName }}</span>
              <ShowcaseIcons :items="r.showcase" />
              <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
            </div>
            <div class="text-xs" style="color: var(--p-text-muted-color)">
              {{ r.exactCount }} {{ t('leaderboard.exact') }} · {{ r.outcomeCount }} {{ t('leaderboard.correct') }}<template v-if="r.championPoints"> · 👑 +{{ r.championPoints }}</template>
            </div>
          </div>
          <div class="text-end shrink-0">
            <span class="text-xl font-bold tabular-nums">{{ r.totalPoints }}</span>
            <span class="text-xs ms-1" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
          </div>
        </NuxtLink>
        <div
          v-if="hiddenCount.data.value"
          v-tooltip.top="{ value: t('leaderboard.hiddenTip'), pt: { text: 'text-xs max-w-64' } }"
          class="flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-2 text-xs cursor-help"
          style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
        >
          <i class="pi pi-eye-slash" style="font-size: 0.7rem" />
          {{ t('leaderboard.hidden', { n: hiddenCount.data.value }, hiddenCount.data.value) }}
          <i class="pi pi-info-circle" style="font-size: 0.7rem; opacity: 0.6" />
        </div>
      </div>

      <LeagueDescription
        v-if="leagueId"
        :league-id="leagueId"
        :description="detail.data.value.league.description"
        :can-manage="canManage"
      />

      <LeagueRewards
        v-if="leagueId"
        :league-id="leagueId"
        :can-manage="canManage"
        :competition-slug="detail.data.value.league.competition?.slug"
      />

      <ChatPanel v-if="isMember && leagueId" :league-id="leagueId" class="mt-6" />

      <AppConfirmDialog
        v-model:visible="confirmLeave"
        :header="t('leagues.leave')"
        :message="t('leagues.leaveConfirm')"
        severity="danger"
        @confirm="leave.mutate(leagueId!)"
      />
    </template>
  </div>
</template>
