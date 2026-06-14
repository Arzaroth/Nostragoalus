<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

const { t } = useI18n()
const slug = useSelectedCompetition()
const { query, setPick } = useBestScorer()
const data = computed<any>(() => query.data.value)
const pending = query.isPending
const selectedTeamCode = ref<string | null>(null)
const selectedPlayerId = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  if (selectedTeamCode.value === null && data.value?.myPick) {
    selectedTeamCode.value = data.value.myPick.teamCode ?? null
    selectedPlayerId.value = data.value.myPick.playerId ?? null
  }
})

// Squads live behind the team endpoint - fetched per selected team, not all 48 at once.
const squadQuery = useQuery({
  queryKey: ['squad', slug, selectedTeamCode],
  enabled: computed(() => !!selectedTeamCode.value),
  queryFn: ({ signal }) =>
    $fetch<any>(`/api/teams/${selectedTeamCode.value}`, {
      query: slug.value ? { competition: slug.value } : {},
      signal,
    }),
})
// Attackers first for picking a top scorer (the provider lists GK->FW).
const POSITION_ORDER: Record<string, number> = { FW: 0, MF: 1, DF: 2, GK: 3 }
const squad = computed<any[]>(() =>
  [...(squadQuery.data.value?.squad ?? [])].sort(
    (a, b) =>
      (POSITION_ORDER[a.position ?? ''] ?? 4) - (POSITION_ORDER[b.position ?? ''] ?? 4) ||
      (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
  ),
)

function onTeamChange() {
  selectedPlayerId.value = null
}
const confirmRepick = ref(false)
// During the window a switch is a re-pick (halves the points); a user with no
// original can't use the window (the server rejects it), so don't offer it.
const isRepick = computed(() => !!data.value?.locked)
// In the window the pickers show whether or not there's an original: switch an
// existing pick, or make a late first pick - both for half.
const showPickers = computed(() => !data.value?.locked || !!data.value?.secondChance?.open)
// A user who already re-picked switches again with no fresh penalty -> no modal.
function onChangePick() {
  if (data.value?.myPick?.repicked) save(true)
  else confirmRepick.value = true
}

function teamName(code: string | null) {
  return data.value?.teams?.find((tm: { code: string; name: string }) => tm.code === code)?.name ?? code
}
function save(repick = false) {
  const player = squad.value.find((p) => p.playerId === selectedPlayerId.value)
  if (player) {
    setPick.mutate({
      playerId: player.playerId,
      playerName: player.name,
      teamCode: selectedTeamCode.value,
      teamName: teamName(selectedTeamCode.value) ?? '',
      repick,
    })
  }
}

// What the showcase displays: the live selection (preview) or the saved pick.
const showcase = computed(() => {
  if (!data.value?.locked) {
    const player = squad.value.find((p) => p.playerId === selectedPlayerId.value)
    if (player) return { playerId: player.playerId, playerName: player.name, teamCode: selectedTeamCode.value }
  }
  return data.value?.myPick ?? null
})
const isSaved = computed(() => !!data.value?.myPick && showcase.value?.playerId === data.value.myPick.playerId)

// Prefer the provider's own headshot (FIFA's digitalhub URL, which we can't
// reconstruct from the id) from the loaded squad; fall back to a constructed
// URL, then the team flag. The squad for the saved pick's team is loaded too,
// so a saved pick gets its real headshot as well.
const squadPhotoById = computed(() => {
  const map = new Map<string, string | null>()
  for (const p of squad.value) map.set(p.playerId, squarePlayerPhoto(p.pictureUrl))
  return map
})
const resolvedPhoto = computed(() => {
  const pid = showcase.value?.playerId
  if (!pid) return null
  return squadPhotoById.value.get(pid) ?? playerPhotoUrl(pid, { provider: data.value?.provider, season: data.value?.season })
})
// On 404 fall back to the team flag; a new resolved URL (e.g. the squad finished
// loading and a real headshot replaced the constructed one) clears the failure.
const photoFailed = ref(false)
watch(resolvedPhoto, () => {
  photoFailed.value = false
})
const photoSrc = computed(() => (photoFailed.value ? null : resolvedPhoto.value))

const NuxtLinkC = resolveComponent('NuxtLink')

// Holographic hover, identical to the champion showcase: the picture tilts
// toward the cursor with a light sweep.
const showcaseEl = ref<HTMLElement | null>(null)
const { elementX, elementY, elementWidth, elementHeight, isOutside } = useMouseInElement(showcaseEl)
const holo = computed(() => {
  if (isOutside.value || !elementWidth.value) return { transform: '', sheen: 0, sx: 50, sy: 50 }
  const px = elementX.value / elementWidth.value
  const py = elementY.value / elementHeight.value
  return {
    transform: `perspective(420px) rotateY(${(px - 0.5) * 22}deg) rotateX(${(0.5 - py) * 22}deg) scale(1.06)`,
    sheen: 1,
    sx: px * 100,
    sy: py * 100,
  }
})
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
        <div class="flex items-center gap-2 font-semibold text-base mb-0.5"><GoldenBoot class="text-xl" /> {{ t('bestScorer.title') }}</div>
        <p class="text-sm mb-2" style="color: var(--p-text-muted-color)">{{ t('bestScorer.hint') }}</p>

        <template v-if="!showPickers">
          <span v-if="!data.myPick" style="color: var(--p-text-muted-color)">{{ t('bestScorer.noPick') }}</span>
          <span v-else class="inline-flex items-center gap-2 text-sm" style="color: var(--p-text-muted-color)">
            <i class="pi pi-lock text-xs" /> {{ t('bestScorer.lockedIn') }}
          </span>
        </template>

        <template v-else>
          <p v-if="isRepick" class="text-xs mb-2" style="color: var(--ng-star)">
            <i class="pi pi-sparkles text-xs" /> {{ data.myPick ? t('bestScorer.secondChanceOpen') : t('bestScorer.secondChanceLate') }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <Select
              v-model="selectedTeamCode"
              :options="data.teams"
              option-label="name"
              option-value="code"
              filter
              :placeholder="t('bestScorer.pickTeam')"
              class="w-full sm:w-72"
              @change="onTeamChange"
            >
              <template #value="{ value, placeholder }">
                <span v-if="value" class="flex items-center gap-2">
                  <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ teamName(value) }}
                </span>
                <span v-else>{{ placeholder }}</span>
              </template>
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ option.name }}
                </span>
              </template>
            </Select>
            <Select
              v-model="selectedPlayerId"
              :options="squad"
              option-label="name"
              option-value="playerId"
              filter
              :disabled="!selectedTeamCode"
              :loading="squadQuery.isFetching.value"
              :placeholder="t('bestScorer.pickPlayer')"
              class="w-full sm:w-72"
            >
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <span class="w-6 text-right tabular-nums" style="color: var(--p-text-muted-color)">{{ option.shirtNumber ?? '–' }}</span>
                  {{ formatPlayerName(option.name) }}
                  <span v-if="option.position" class="text-xs" style="color: var(--p-text-muted-color)">{{ option.position }}</span>
                </span>
              </template>
            </Select>
            <Button
              :label="isRepick ? (data.myPick ? t('bestScorer.changePick') : t('bestScorer.pickLate')) : t('common.save')"
              :icon="isRepick ? 'pi pi-sync' : 'pi pi-check'"
              :severity="isRepick ? 'warn' : undefined"
              :disabled="!selectedPlayerId || selectedPlayerId === data.myPick?.playerId"
              :loading="saving"
              @click="isRepick ? onChangePick() : save(false)"
            />
          </div>
        </template>
        <p v-if="data.myPick?.repicked && data.myPick?.originalPlayerName" class="text-xs mt-2" style="color: var(--p-text-muted-color)">
          {{ t('bestScorer.repickedNote', { player: formatPlayerName(data.myPick.originalPlayerName) }) }}
        </p>
      </div>

      <!-- Golden boot showcase -->
      <div class="shrink-0 flex flex-col items-center gap-2 self-center sm:self-start sm:pr-2">
        <component :is="showcase?.teamCode ? NuxtLinkC : 'div'" :to="showcase?.teamCode ? `/${slug}/teams/${showcase.teamCode}` : undefined" class="relative mt-1 block" :class="{ 'hover:opacity-90': showcase?.teamCode }">
          <template v-if="showcase">
            <div
              class="absolute -inset-4 rounded-full blur-xl pointer-events-none"
              style="background: radial-gradient(circle, rgba(245, 179, 1, 0.4), transparent 70%)"
            />
            <span
              class="absolute -top-3 -left-3 text-2xl z-10 select-none"
              style="transform: rotate(-25deg); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))"
            ><GoldenBoot /></span>
            <span ref="showcaseEl" class="relative block w-16 h-16 rounded-2xl" style="transition: transform 0.25s ease" :style="{ transform: holo.transform }">
              <img
                :src="photoSrc || flagUrl(showcase.teamCode) || ''"
                class="relative w-16 h-16 rounded-2xl object-cover"
                style="box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.6), 0 10px 24px rgba(0, 0, 0, 0.3)"
                alt=""
                @error="photoFailed = true"
              >
              <span
                class="absolute inset-0 rounded-2xl pointer-events-none"
                style="transition: opacity 0.25s ease; mix-blend-mode: screen"
                :style="{
                  opacity: holo.sheen * 0.75,
                  background: `radial-gradient(140px circle at ${holo.sx}% ${holo.sy}%, rgba(255,255,255,0.55), rgba(245,179,1,0.18) 45%, transparent 70%)`,
                }"
              />
            </span>
          </template>
          <template v-else>
            <span class="absolute -top-3 -left-3 text-2xl z-10 opacity-30 grayscale select-none" style="transform: rotate(-25deg)"><GoldenBoot /></span>
            <div
              class="w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center text-2xl"
              style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
            >?</div>
          </template>
        </component>
        <div class="text-center w-24">
          <strong v-if="showcase" class="block leading-tight">{{ formatPlayerName(showcase.playerName) }}</strong>
          <span v-else class="block text-sm leading-tight" style="color: var(--p-text-muted-color)">{{ t('bestScorer.pickPlayer') }}</span>
          <!-- one reserved line: awarded points / worth (preview or locked) / spacer - the card never resizes -->
          <span v-if="isSaved && data.myPick?.awardedPoints > 0" class="text-xs block mt-0.5 font-bold" style="color: var(--ng-success)">+{{ data.myPick.awardedPoints }} pts</span>
          <span
            v-else
            class="text-xs block mt-0.5"
            :class="{ invisible: !(showcase && data.bonus) }"
            style="color: var(--p-text-muted-color)"
          >{{ data.bonus ? t('champion.worth', { points: isSaved && data.myPick?.repicked ? Math.floor(data.bonus / 2) : data.bonus }) : ' ' }}</span>
        </div>
      </div>
    </div>

    <AppConfirmDialog
      v-model:visible="confirmRepick"
      :header="data?.myPick ? t('bestScorer.changePick') : t('bestScorer.pickLate')"
      :message="data?.myPick ? t('bestScorer.repickConfirm') : t('bestScorer.pickLateConfirm')"
      :confirm-label="data?.myPick ? t('bestScorer.changePick') : t('bestScorer.pickLate')"
      severity="danger"
      @confirm="save(true)"
    />
  </div>
</template>
