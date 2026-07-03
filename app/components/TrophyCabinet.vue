<script setup lang="ts">
import type { AchievementDto, CompetitionAwardType, FridgePinInput, TrophyDto } from '#shared/types/achievements'
import { FRIDGE_SLOT_COUNT } from '#shared/types/achievements'

const props = defineProps<{ userId: string }>()
const { t } = useI18n()

const { data: cabinet, isLoading } = useCabinet(() => props.userId)
const fridge = useFridge()

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
  SECRET: 'pi pi-sparkles',
}
const TIER_TINT: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#9ca3af', GOLD: '#eab308' }
const TROPHY_TINT = '#eab308'

interface Display {
  itemType: 'TROPHY' | 'ACHIEVEMENT'
  itemKey: string
  name: string
  desc: string
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

// Everything the owner may pin: earned trophies + earned badges.
const pinnable = computed(() => [...trophies.value, ...badges.value.filter((b) => !b.locked)])
const byKey = computed(() => new Map(pinnable.value.map((d) => [`${d.itemType}:${d.itemKey}`, d])))
const fridgeItems = computed(() =>
  (cabinet.value?.fridge ?? [])
    .map((f) => byKey.value.get(`${f.itemType}:${f.itemKey}`))
    .filter((d): d is Display => !!d),
)

const editing = ref(false)
const selected = ref<FridgePinInput[]>([])
const slotsFull = computed(() => selected.value.length >= FRIDGE_SLOT_COUNT)
function isPinned(d: Display) {
  return selected.value.some((s) => s.itemType === d.itemType && s.itemKey === d.itemKey)
}
function togglePin(d: Display) {
  const i = selected.value.findIndex((s) => s.itemType === d.itemType && s.itemKey === d.itemKey)
  if (i >= 0) selected.value.splice(i, 1)
  else if (!slotsFull.value) selected.value.push({ itemType: d.itemType, itemKey: d.itemKey })
}
function startEdit() {
  selected.value = (cabinet.value?.fridge ?? []).map((f) => ({ itemType: f.itemType, itemKey: f.itemKey }))
  editing.value = true
}
async function save() {
  await fridge.mutateAsync(selected.value)
  editing.value = false
}
</script>

<template>
  <section id="cabinet" class="mt-6" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem)">
    <h2 class="text-lg font-bold mb-3">{{ t('achievements.cabinetTitle') }}</h2>

    <p v-if="isLoading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</p>

    <template v-else-if="cabinet">
      <!-- My fridge: the curated showcase -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--p-text-muted-color)">
            {{ t('achievements.fridgeTitle') }}
          </h3>
          <div v-if="isOwner" class="flex items-center gap-2">
            <span v-if="editing" class="text-xs" style="color: var(--p-text-muted-color)">
              {{ selected.length }}/{{ FRIDGE_SLOT_COUNT }}
            </span>
            <Button
              v-if="!editing"
              size="small"
              severity="secondary"
              :label="t('achievements.editFridge')"
              icon="pi pi-pencil"
              @click="startEdit"
            />
            <Button
              v-else
              size="small"
              :label="t('achievements.doneEditing')"
              icon="pi pi-check"
              :loading="fridge.isPending.value"
              @click="save"
            />
          </div>
        </div>

        <!-- Edit mode: pick from everything earned -->
        <div v-if="editing" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile
            v-for="d in pinnable"
            :key="`${d.itemType}:${d.itemKey}`"
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
        <div v-else-if="fridgeItems.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <CabinetTile v-for="d in fridgeItems" :key="`${d.itemType}:${d.itemKey}`" v-bind="d" />
        </div>
        <p v-else class="text-sm" style="color: var(--p-text-muted-color)">
          {{ isOwner ? t('achievements.fridgeEmptyOwn') : t('achievements.fridgeEmpty') }}
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
