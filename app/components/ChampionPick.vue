<script setup lang="ts">
const { t } = useI18n()
const NuxtLinkC = resolveComponent('NuxtLink')
const slug = useSelectedCompetition()
const { query, setPick } = useChampion()
const data = computed<any>(() => query.data.value)
const pending = query.isPending
const selectedCode = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  selectedCode.value = data.value?.myPick?.teamCode ?? null
})

const confirmRepick = ref(false)
// In the window, anything you'd save now is a re-pick worth half - a switch of an
// existing pick OR a late first pick (the server halves both). The current saved
// pick still pays full until you actually switch (then it's halved for good).
const repickMode = computed(() => !!(data.value?.locked && data.value?.secondChance?.open))
const prospPts = (points: number) => (repickMode.value ? halvePickPoints(points) : points)

// First switch is the consequential one (it latches the permanent half); a
// later switch by an already-re-picked user changes nothing about the penalty,
// so it skips the warning modal.
function onChangePick() {
  if (data.value?.myPick?.repicked) save(true)
  else confirmRepick.value = true
}

function teamName(code: string | null) {
  return data.value?.teams?.find((tm: ChampionTeam) => tm.code === code)?.name ?? code
}
function save(repick = false) {
  const team = data.value?.teams?.find((tm: ChampionTeam) => tm.code === selectedCode.value)
  if (team) setPick.mutate({ ...team, repick })
}

// What the crown showcase displays: the live selection (preview) or the saved pick.
const showcaseCode = computed(() =>
  data.value?.locked ? (data.value?.myPick?.teamCode ?? null) : (selectedCode.value ?? data.value?.myPick?.teamCode ?? null),
)
const isSaved = computed(() => !!data.value?.myPick && showcaseCode.value === data.value.myPick.teamCode)

// Points the displayed pick pays if it wins: the saved pick keeps the value
// snapshotted at pick time, a preview shows what picking now would lock in.
const showcaseWorth = computed<{ rank: number | null; points: number } | null>(() => {
  if (!showcaseCode.value) return null
  if (isSaved.value && data.value?.myPick) {
    // The saved pick: full worth until it's actually re-picked, then half.
    const full = data.value.myPick.potentialPoints
    return { rank: data.value.myPick.fifaRank ?? null, points: data.value.myPick.repicked ? halvePickPoints(full) : full }
  }
  // A previewed (not-yet-saved) team in the window is a prospective switch.
  const team = data.value?.teams?.find((tm: ChampionTeam) => tm.code === showcaseCode.value)
  return team ? { rank: team.fifaRank, points: prospPts(team.potentialPoints) } : null
})

function worthLabel(rank: number | null, points: number) {
  const worth = t('champion.worth', { points })
  return rank == null ? worth : `${t('champion.fifaRank', { rank })} · ${worth}`
}
</script>

<template>
  <div v-if="pending" class="ng-card rounded-2xl border px-4 py-3 h-full" style="background: var(--p-content-background)">
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <Skeleton width="9rem" height="1.25rem" />
        <Skeleton width="100%" height="0.75rem" />
        <Skeleton width="55%" height="0.75rem" />
      </div>
      <div class="shrink-0 flex flex-col items-center gap-2">
        <Skeleton width="4rem" height="4rem" border-radius="0.75rem" />
        <Skeleton width="5rem" height="0.85rem" />
      </div>
    </div>
  </div>
  <div v-else-if="data && data.competition" class="ng-card rounded-2xl border px-4 py-3 h-full" style="background: var(--p-content-background)">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 font-semibold text-base mb-0.5"><span class="text-xl">🏆</span> {{ t('champion.title') }}</div>
        <p class="text-sm mb-2" style="color: var(--p-text-muted-color)">{{ t('champion.hint') }}</p>

        <template v-if="data.locked">
          <!-- Second chance: switch an existing pick, or make a late first pick,
               while the window is open - either way for half the points. -->
          <div v-if="data.secondChance.open" class="flex flex-col gap-2">
            <p class="text-xs" style="color: var(--ng-star)">
              <i class="pi pi-sparkles text-xs" /> {{ data.myPick ? t('champion.secondChanceOpen') : t('champion.secondChanceLate') }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <Select
                v-model="selectedCode"
                :options="data.teams"
                option-label="name"
                option-value="code"
                filter
                :placeholder="t('champion.pick')"
                class="w-full sm:w-72"
              >
                <template #value="{ value, placeholder }">
                  <span v-if="value" class="flex items-center gap-2">
                    <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                    {{ teamName(value) }}
                  </span>
                  <span v-else>{{ placeholder }}</span>
                </template>
                <template #option="{ option }">
                  <span class="flex items-center gap-2 w-full">
                    <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                    {{ option.name }}
                    <span class="ms-auto text-xs whitespace-nowrap" style="color: var(--p-text-muted-color)">
                      {{ worthLabel(option.fifaRank, prospPts(option.potentialPoints)) }}
                    </span>
                  </span>
                </template>
              </Select>
              <Button
                :label="data.myPick ? t('champion.changePick') : t('champion.pickLate')"
                icon="pi pi-sync"
                severity="warn"
                :disabled="!selectedCode || selectedCode === data.myPick?.teamCode"
                :loading="saving"
                @click="onChangePick"
              />
            </div>
          </div>
          <span v-else-if="!data.myPick" style="color: var(--p-text-muted-color)">{{ t('champion.noPick') }}</span>
          <span v-else class="inline-flex items-center gap-2 text-sm" style="color: var(--p-text-muted-color)">
            <i class="pi pi-lock text-xs" /> {{ t('champion.lockedIn') }}
          </span>
          <p v-if="data.myPick?.repicked && data.myPick?.originalTeamName" class="text-xs mt-2" style="color: var(--p-text-muted-color)">
            {{ t('champion.repickedNote', { team: data.myPick.originalTeamName }) }}
          </p>
        </template>

        <template v-else>
          <div class="flex flex-wrap items-center gap-3">
            <Select
              v-model="selectedCode"
              :options="data.teams"
              option-label="name"
              option-value="code"
              filter
              :placeholder="t('champion.pick')"
              class="w-full sm:w-72"
            >
              <template #value="{ value, placeholder }">
                <span v-if="value" class="flex items-center gap-2">
                  <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ teamName(value) }}
                </span>
                <span v-else>{{ placeholder }}</span>
              </template>
              <template #option="{ option }">
                <span class="flex items-center gap-2 w-full">
                  <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ option.name }}
                  <span class="ms-auto text-xs whitespace-nowrap" style="color: var(--p-text-muted-color)">
                    {{ worthLabel(option.fifaRank, option.potentialPoints) }}
                  </span>
                </span>
              </template>
            </Select>
            <Button
              :label="t('common.save')"
              icon="pi pi-check"
              :disabled="!selectedCode || selectedCode === data.myPick?.teamCode"
              :loading="saving"
              @click="save()"
            />
          </div>
        </template>
      </div>

      <!-- Crowned champion showcase -->
      <MetaPickShowcase
        :present="!!showcaseCode"
        :image-url="showcaseCode ? flagUrl(showcaseCode) || null : null"
        :link-to="showcaseCode ? `/${slug}/teams/${showcaseCode}` : null"
      >
        <template #emblem>👑</template>
        <template #caption>
          <component :is="NuxtLinkC" v-if="showcaseCode" :to="`/${slug}/teams/${showcaseCode}`" class="hover:underline">
            <strong class="block leading-tight">{{ teamName(showcaseCode) }}</strong>
          </component>
          <span v-else class="block text-sm leading-tight" style="color: var(--p-text-muted-color)">{{ t('champion.pick') }}</span>
          <!-- one reserved line: points / preview hint / worth / invisible spacer - the card never resizes -->
          <span v-if="isSaved && data.myPick?.awardedPoints > 0" class="text-xs block mt-0.5 font-bold" style="color: var(--ng-success)">+{{ data.myPick.awardedPoints }} pts</span>
          <span
            v-else-if="showcaseCode && !isSaved && !data.locked"
            class="text-xs block mt-0.5"
            style="color: var(--p-text-muted-color)"
          >{{ showcaseWorth ? worthLabel(showcaseWorth.rank, showcaseWorth.points) : t('champion.preview') }}</span>
          <span
            v-else
            class="text-xs block mt-0.5"
            :class="{ invisible: !(showcaseCode && showcaseWorth) }"
            style="color: var(--p-text-muted-color)"
          >{{ showcaseWorth ? worthLabel(showcaseWorth.rank, showcaseWorth.points) : ' ' }}</span>
        </template>
      </MetaPickShowcase>
    </div>

    <AppConfirmDialog
      v-model:visible="confirmRepick"
      :header="data?.myPick ? t('champion.changePick') : t('champion.pickLate')"
      :message="data?.myPick ? t('champion.repickConfirm') : t('champion.pickLateConfirm')"
      :confirm-label="data?.myPick ? t('champion.changePick') : t('champion.pickLate')"
      severity="danger"
      @confirm="save(true)"
    />
  </div>
</template>
