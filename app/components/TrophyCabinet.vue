<script setup lang="ts">
import type { AchievementDto, CompetitionAwardType, ShowcasePinInput, TrophyDto } from '#shared/types/achievements'
import { SHOWCASE_SLOT_COUNT } from '#shared/types/achievements'
import type { LeagueRewardCriterion } from '#shared/types/rewards'

const props = defineProps<{ userId: string }>()
const { t } = useI18n()

const { data: cabinet, isLoading } = useCabinet(() => props.userId)
const showcase = useShowcase()

const TROPHY_ICON: Record<CompetitionAwardType, string> = {
  OVERALL: 'pi pi-trophy',
  GROUP_PHASE: 'pi pi-users',
  KNOCKOUT_PHASE: 'pi pi-sitemap',
  MADAME_IRMA: 'pi pi-eye',
  TEAM_SPECIALIST: 'pi pi-flag',
}
const CATEGORY_ICON: Record<string, string> = {
  MILESTONE: 'pi pi-bolt',
  BEHAVIORAL: 'pi pi-clock',
  CROWD: 'pi pi-users',
  JOKER: 'pi pi-star',
  ORACLE: 'pi pi-eye',
  STREAK: 'pi pi-forward',
  TROPHY_META: 'pi pi-trophy',
  SHAME: 'pi pi-thumbs-down',
  SECRET: 'pi pi-sparkles',
}
const TIER_TINT: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#9ca3af', GOLD: '#eab308' }
const TROPHY_TINT = '#eab308'

interface Display {
  itemType: 'TROPHY' | 'ACHIEVEMENT'
  itemKey: string
  name: string
  desc: string
  criteria: string
  icon: string
  tint: string
  tier: string | null
  locked: boolean
  flag: string | null
}

function trophyDisplay(tr: TrophyDto): Display {
  const isTeam = tr.type === 'TEAM_SPECIALIST'
  const nameKey = isTeam && !tr.teamCode ? 'TEAM_SPECIALIST_GENERIC' : tr.type
  return {
    itemType: 'TROPHY',
    itemKey: tr.type,
    name: t(`achievements.trophy.${nameKey}.name`, { team: tr.teamCode ?? '' }),
    desc: t(`achievements.trophy.${nameKey}.desc`, { team: tr.teamCode ?? '' }),
    criteria: t(`achievements.trophy.${nameKey}.criteria`, { team: tr.teamCode ?? '' }),
    icon: TROPHY_ICON[tr.type],
    tint: TROPHY_TINT,
    tier: null,
    locked: false,
    flag: isTeam ? flagUrl(tr.teamCode) : null,
  }
}

function badgeDisplay(a: AchievementDto): Display {
  const tier = a.earned?.tier ?? null
  return {
    itemType: 'ACHIEVEMENT',
    itemKey: a.key,
    name: t(`achievements.badge.${a.key}.name`),
    desc: t(`achievements.badge.${a.key}.desc`),
    criteria: t(`achievements.badge.${a.key}.criteria`),
    icon: CATEGORY_ICON[a.category] ?? 'pi pi-verified',
    tint: tier ? TIER_TINT[tier] : 'var(--p-primary-color)',
    tier: tier ? t(`achievements.tier.${tier}`) : null,
    locked: !a.earned,
    flag: null,
  }
}

const trophies = computed(() => (cabinet.value?.trophies ?? []).map(trophyDisplay))
const badges = computed(() =>
  (cabinet.value?.achievements ?? [])
    .map(badgeDisplay)
    .sort((a, b) => Number(a.locked) - Number(b.locked)),
)
const isOwner = computed(() => cabinet.value?.isOwner ?? false)
// Prizes across the viewer's leagues (own cabinet only): held (lit) + chased
// (tentative, greyed). Each opens that criterion's live ranking.
const myRewards = useMyRewards(isOwner)
const criterionName = useCriterionName()

const rankingLeagueId = ref<string | null>(null)
const rankingType = ref<LeagueRewardCriterion | null>(null)
const rankingTeamCode = ref<string | null>(null)
const rankingOpen = ref(false)
function openReward(r: { leagueId: string; type: LeagueRewardCriterion; teamCode: string | null }) {
  rankingLeagueId.value = r.leagueId
  rankingType.value = r.type
  rankingTeamCode.value = r.teamCode
  rankingOpen.value = true
}

// The showcase holds earned achievements only; a Display's itemKey is the key.
const pinnable = computed(() => badges.value.filter((b) => !b.locked))
const byKey = computed(() => new Map(pinnable.value.map((d) => [d.itemKey, d])))
const showcaseItems = computed(() =>
  (cabinet.value?.showcase ?? [])
    .map((s) => byKey.value.get(s.achievementKey))
    .filter((d): d is Display => !!d),
)

const editing = ref(false)
const selected = ref<ShowcasePinInput[]>([])
const slotsFull = computed(() => selected.value.length >= SHOWCASE_SLOT_COUNT)
function isPinned(d: Display) {
  return selected.value.some((s) => s.achievementKey === d.itemKey)
}
function togglePin(d: Display) {
  const i = selected.value.findIndex((s) => s.achievementKey === d.itemKey)
  if (i >= 0) selected.value.splice(i, 1)
  else if (!slotsFull.value) selected.value.push({ achievementKey: d.itemKey })
}
function startEdit() {
  selected.value = (cabinet.value?.showcase ?? []).map((s) => ({ achievementKey: s.achievementKey }))
  editing.value = true
}
async function save() {
  await showcase.mutateAsync(selected.value)
  editing.value = false
}
</script>

<template>
  <section id="cabinet" class="mt-6" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem)">
    <h2 class="text-lg font-bold mb-3">{{ t('achievements.cabinetTitle') }}</h2>

    <p v-if="isLoading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</p>

    <template v-else-if="cabinet">
      <!-- Prizes across your leagues: held (lit) and chased (tentative, greyed) -->
      <div v-if="isOwner && (myRewards.data.value?.length ?? 0) > 0" class="mb-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide mb-2" style="color: var(--p-text-muted-color)">
          {{ t('reward.myPrizes') }}
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-for="r in myRewards.data.value"
            :key="`${r.leagueId}:${r.type}`"
            type="button"
            class="rounded-lg border p-2 flex items-center gap-2 text-left cursor-pointer hover:brightness-95"
            :class="r.youHold ? '' : 'opacity-60'"
            :style="`border-color: ${r.youHold ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}`"
            @click="openReward(r)"
          >
            <img v-if="r.reward.imageUrl" :src="r.reward.imageUrl" class="w-10 h-10 rounded object-cover shrink-0" alt="" >
            <i v-else class="pi pi-gift text-xl shrink-0" style="color: var(--p-primary-color)" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold truncate">{{ r.reward.label }}</div>
              <div class="text-xs truncate" style="color: var(--p-text-muted-color)">
                {{ r.leagueName }} - {{ criterionName(r.type, r.teamCode) }}
              </div>
            </div>
            <span
              class="text-[0.6rem] uppercase tracking-wide font-semibold shrink-0"
              :style="`color: ${r.youHold ? 'var(--p-primary-color)' : 'var(--p-text-muted-color)'}`"
            >{{ r.youHold ? t('reward.holding') : t('reward.chasing') }}</span>
          </button>
        </div>
      </div>

      <RewardRankingDialog v-model:visible="rankingOpen" :league-id="rankingLeagueId" :type="rankingType" :team-code="rankingTeamCode" />

      <!-- My showcase: the curated set of pinned achievements -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--p-text-muted-color)">
            {{ t('achievements.showcaseTitle') }}
          </h3>
          <div v-if="isOwner" class="flex items-center gap-2">
            <span v-if="editing" class="text-xs" style="color: var(--p-text-muted-color)">
              {{ selected.length }}/{{ SHOWCASE_SLOT_COUNT }}
            </span>
            <Button
              v-if="!editing"
              size="small"
              severity="secondary"
              :label="t('achievements.editShowcase')"
              icon="pi pi-pencil"
              @click="startEdit"
            />
            <Button
              v-else
              size="small"
              :label="t('achievements.doneEditing')"
              icon="pi pi-check"
              :loading="showcase.isPending.value"
              @click="save"
            />
          </div>
        </div>

        <!-- Edit mode: pick from every earned achievement -->
        <div v-if="editing" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile
            v-for="d in pinnable"
            :key="d.itemKey"
            v-bind="d"
            editable
            :pinned="isPinned(d)"
            :pin-disabled="slotsFull"
            @toggle="togglePin(d)"
          />
          <p v-if="pinnable.length === 0" class="col-span-full text-sm" style="color: var(--p-text-muted-color)">
            {{ t('achievements.empty') }}
          </p>
        </div>

        <!-- Read mode: the pinned showcase -->
        <div v-else-if="showcaseItems.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile v-for="d in showcaseItems" :key="d.itemKey" v-bind="d" />
        </div>
        <p v-else class="text-sm" style="color: var(--p-text-muted-color)">
          {{ isOwner ? t('achievements.showcaseEmptyOwn') : t('achievements.showcaseEmpty') }}
        </p>
      </div>

      <!-- Trophies -->
      <div v-if="trophies.length > 0" class="mb-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide mb-2" style="color: var(--p-text-muted-color)">
          {{ t('achievements.trophiesHeading') }}
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile v-for="d in trophies" :key="d.itemKey" v-bind="d" />
        </div>
      </div>

      <!-- Achievements (earned lit, locked greyed) -->
      <div>
        <h3 class="text-sm font-semibold uppercase tracking-wide mb-2" style="color: var(--p-text-muted-color)">
          {{ t('achievements.badgesHeading') }}
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile v-for="d in badges" :key="d.itemKey" v-bind="d" />
        </div>
      </div>
    </template>
  </section>
</template>
