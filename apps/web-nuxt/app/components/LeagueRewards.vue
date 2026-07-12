<script setup lang="ts">
import { LEAGUE_REWARD_CRITERIA, type LeagueRewardCriterion, type LeagueRewardInput } from '#shared/types/rewards'

const props = defineProps<{ leagueId: string; canManage: boolean; competitionSlug?: string | null }>()
const { t } = useI18n()
const { standings, save } = useLeagueRewards(() => props.leagueId)
const { update } = useLeagueActions()
const criterionName = useCriterionName()

// A leader the viewer isn't allowed to see (private profile / admin-hidden) comes
// back with an empty name; show a neutral placeholder rather than a blank.
function leaderNames(winners: { displayName: string }[]): string {
  const shown = winners.map((w) => w.displayName).filter((n) => n !== '')
  return shown.length > 0 ? shown.join(', ') : t('reward.hiddenLeader')
}

// The prizes actually configured (members see these), in criterion order.
const configured = computed(() => (standings.data.value ?? []).filter((s) => s.reward))

// Open a criterion's live ranking. Disabled criteria (TEAM_SPECIALIST with no
// featured team) have no ranking to show.
const rankingType = ref<LeagueRewardCriterion | null>(null)
const rankingTeamCode = ref<string | null>(null)
const rankingOpen = ref(false)
function openRanking(s: { type: LeagueRewardCriterion; teamCode: string | null; disabled: boolean }) {
  if (s.disabled) return
  rankingType.value = s.type
  rankingTeamCode.value = s.teamCode
  rankingOpen.value = true
}

interface FormRow {
  type: LeagueRewardCriterion
  label: string
  note: string
  link: string
  currentUrl: string | null
  dataUrl?: string
  cleared?: boolean
}
const editing = ref(false)
const form = ref<FormRow[]>([])
// The league's TEAM_SPECIALIST team, edited alongside its prize.
const featuredTeam = ref<string | null>(null)
const addType = ref<LeagueRewardCriterion | ''>('')

// The competition's teams for the TEAM_SPECIALIST picker, loaded once on first edit.
const teams = ref<{ code: string; name: string }[]>([])
const teamsLoaded = ref(false)
async function ensureTeams() {
  if (teamsLoaded.value || !props.competitionSlug) return
  const r = await $fetch<{ teams: { code: string; name: string }[] }>('/api/competitions/teams', {
    query: { competition: props.competitionSlug },
  })
  teams.value = r.teams
  teamsLoaded.value = true
}

function currentFeaturedTeam(): string | null {
  return (standings.data.value ?? []).find((s) => s.type === 'TEAM_SPECIALIST')?.teamCode ?? null
}

function openEdit() {
  const byType = new Map((standings.data.value ?? []).map((s) => [s.type, s]))
  form.value = LEAGUE_REWARD_CRITERIA.filter((type) => byType.get(type)?.reward).map((type) => {
    const s = byType.get(type)!
    return { type, label: s.reward!.label, note: s.reward!.note ?? '', link: s.reward!.link ?? '', currentUrl: s.reward!.imageUrl ?? null }
  })
  featuredTeam.value = currentFeaturedTeam()
  addType.value = ''
  editing.value = true
  ensureTeams()
}

const usedTypes = computed(() => new Set(form.value.map((r) => r.type)))
const available = computed(() => LEAGUE_REWARD_CRITERIA.filter((type) => !usedTypes.value.has(type)))

function addPrize() {
  if (!addType.value) return
  form.value.push({ type: addType.value, label: '', note: '', link: '', currentUrl: null })
  addType.value = ''
}
function removePrize(index: number) {
  form.value.splice(index, 1)
}

function onFile(row: FormRow, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const fr = new FileReader()
  fr.onload = () => {
    row.dataUrl = fr.result as string
    row.cleared = false
  }
  fr.readAsDataURL(file)
}
function clearImage(row: FormRow) {
  row.dataUrl = undefined
  row.cleared = true
  row.currentUrl = null
}
function previewFor(row: FormRow): string | null {
  return row.dataUrl ?? (row.cleared ? null : row.currentUrl)
}

const saving = computed(() => save.isPending.value || update.isPending.value)

async function submit() {
  // Replace-set: every criterion is either present (its label) or blank (deleted).
  // A blank label clears the prize server-side, so removed rows are deletions.
  const rowByType = new Map(form.value.map((r) => [r.type, r]))
  const items: LeagueRewardInput[] = LEAGUE_REWARD_CRITERIA.map((type) => {
    const r = rowByType.get(type)
    if (!r) return { type, label: '', imageDataUrl: null }
    return {
      type,
      label: r.label,
      imageDataUrl: r.dataUrl ?? (r.cleared ? null : undefined),
      note: r.note.trim() || null,
      link: r.link.trim() || null,
    }
  })
  await save.mutateAsync(items)
  if ((featuredTeam.value ?? null) !== currentFeaturedTeam()) {
    await update.mutateAsync({ leagueId: props.leagueId, featuredTeamCode: featuredTeam.value ?? null })
  }
  editing.value = false
}
</script>

<template>
  <section class="mt-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-bold">{{ t('reward.title') }}</h3>
      <Button v-if="canManage" size="small" severity="secondary" icon="pi pi-pencil" :label="t('reward.edit')" @click="openEdit" />
    </div>

    <div v-if="standings.isLoading.value" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</div>
    <p v-else-if="configured.length === 0" class="text-sm" style="color: var(--p-text-muted-color)">
      {{ canManage ? t('reward.noneOwner') : t('reward.none') }}
    </p>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div
        v-for="s in configured"
        :key="s.type"
        class="rounded-lg border p-3 flex gap-3 text-left"
        :class="s.disabled ? 'opacity-60' : 'cursor-pointer hover:brightness-95'"
        :style="`border-color: ${s.youHold ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}`"
        :role="s.disabled ? undefined : 'button'"
        :tabindex="s.disabled ? undefined : 0"
        @click="openRanking(s)"
        @keydown.enter="openRanking(s)"
      >
        <img v-if="s.reward!.imageUrl" :src="s.reward!.imageUrl" class="w-14 h-14 rounded object-cover shrink-0" alt="" >
        <i v-else class="pi pi-gift text-2xl shrink-0" style="color: var(--p-primary-color)" />
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wide flex items-center gap-1" style="color: var(--p-text-muted-color)">
            {{ criterionName(s.type, s.teamCode) }}
            <i v-if="!s.disabled" class="pi pi-chart-bar text-[0.65rem]" />
          </div>
          <div class="font-semibold leading-tight">{{ s.reward!.label }}</div>
          <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">
            <template v-if="s.disabled">{{ t('reward.teamSpecialistDisabled') }}</template>
            <template v-else-if="s.winners.length > 0">
              {{ t('reward.currentLeader') }}: {{ leaderNames(s.winners) }}
              <span v-if="s.youHold" class="font-semibold" style="color: var(--p-primary-color)"> - {{ t('reward.you') }}</span>
            </template>
            <template v-else>{{ t('reward.noLeader') }}</template>
          </div>
          <a v-if="s.reward!.link" :href="s.reward!.link" target="_blank" rel="noopener" class="text-xs hover:underline" style="color: var(--p-primary-color)" @click.stop>{{ t('reward.details') }}</a>
          <div v-if="s.reward!.note" class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ s.reward!.note }}</div>
        </div>
      </div>
    </div>

    <RewardRankingDialog v-model:visible="rankingOpen" :league-id="leagueId" :type="rankingType" :team-code="rankingTeamCode" />

    <Dialog v-model:visible="editing" modal :header="t('reward.title')" class="w-[95vw] max-w-2xl">
      <div class="flex flex-col gap-4">
        <p v-if="form.length === 0" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('reward.editEmpty') }}</p>
        <div v-for="(row, i) in form" :key="row.type" class="border-b pb-3 last:border-b-0" style="border-color: var(--p-content-border-color)">
          <div class="flex items-center justify-between mb-1">
            <div class="text-sm font-semibold">{{ criterionName(row.type, featuredTeam) }}</div>
            <button type="button" class="text-xs hover:underline" style="color: var(--ng-danger)" @click="removePrize(i)">
              {{ t('reward.removePrize') }}
            </button>
          </div>
          <div class="flex gap-3">
            <div class="shrink-0">
              <img v-if="previewFor(row)" :src="previewFor(row)!" class="w-16 h-16 rounded object-cover" alt="" >
              <div v-else class="w-16 h-16 rounded flex items-center justify-center" style="background: var(--p-content-border-color)"><i class="pi pi-image" /></div>
              <div class="mt-1 flex gap-1">
                <label class="text-xs cursor-pointer hover:underline" style="color: var(--p-primary-color)">
                  {{ t('reward.image') }}
                  <input type="file" accept="image/*" class="hidden" @change="(e) => onFile(row, e)" >
                </label>
                <button v-if="previewFor(row)" type="button" class="text-xs hover:underline" style="color: var(--p-text-muted-color)" @click="clearImage(row)">{{ t('reward.clearImage') }}</button>
              </div>
            </div>
            <div class="flex-1 flex flex-col gap-2">
              <InputText v-model="row.label" :placeholder="t('reward.label')" size="small" />
              <!-- The Team Specialist prize also needs a featured team to be earnable. -->
              <select
                v-if="row.type === 'TEAM_SPECIALIST'"
                v-model="featuredTeam"
                :aria-label="t('reward.featuredTeam')"
                class="rounded-lg border px-2 py-1.5 text-sm disabled:opacity-50"
                :disabled="teams.length === 0"
                style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
              >
                <option :value="null">{{ t('reward.noFeaturedTeam') }}</option>
                <option v-for="team in teams" :key="team.code" :value="team.code">{{ team.name }} ({{ team.code }})</option>
              </select>
              <p v-if="row.type === 'TEAM_SPECIALIST' && !featuredTeam" class="text-xs" style="color: var(--p-text-muted-color)">
                {{ t('reward.teamSpecialistPickTeam') }}
              </p>
              <InputText v-model="row.note" :placeholder="t('reward.note')" size="small" />
              <InputText v-model="row.link" :placeholder="t('reward.link')" size="small" />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <select
            v-model="addType"
            :aria-label="t('reward.addPrize')"
            :disabled="available.length === 0"
            class="flex-1 rounded-lg border px-2 py-1.5 text-sm disabled:opacity-50"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <option value="">{{ t('reward.pickCriterion') }}</option>
            <option v-for="type in available" :key="type" :value="type">{{ criterionName(type, featuredTeam) }}</option>
          </select>
          <Button size="small" icon="pi pi-plus" :label="t('reward.addPrize')" :disabled="!addType" @click="addPrize" />
        </div>
      </div>
      <template #footer>
        <Button severity="secondary" :label="t('common.cancel')" @click="editing = false" />
        <Button :label="t('reward.save')" icon="pi pi-check" :loading="saving" @click="submit" />
      </template>
    </Dialog>
  </section>
</template>
