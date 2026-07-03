<script setup lang="ts">
import { COMPETITION_AWARD_TYPES, type CompetitionAwardType } from '#shared/types/achievements'
import type { LeagueRewardInput } from '#shared/types/rewards'

const props = defineProps<{ leagueId: string; canManage: boolean }>()
const { t } = useI18n()
const { standings, save } = useLeagueRewards(() => props.leagueId)

function criterionName(type: CompetitionAwardType, teamCode: string | null): string {
  if (type === 'TEAM_SPECIALIST') {
    return teamCode
      ? t('achievements.trophy.TEAM_SPECIALIST.name', { team: teamCode })
      : t('achievements.trophy.TEAM_SPECIALIST_GENERIC.name')
  }
  return t(`achievements.trophy.${type}.name`)
}

// A leader the viewer isn't allowed to see (private profile / admin-hidden) comes
// back with an empty name; show a neutral placeholder rather than a blank.
function leaderNames(winners: { displayName: string }[]): string {
  const shown = winners.map((w) => w.displayName).filter((n) => n !== '')
  return shown.length > 0 ? shown.join(', ') : t('reward.hiddenLeader')
}

// The prizes actually configured (members see these); the owner edits all five.
const configured = computed(() => (standings.data.value ?? []).filter((s) => s.reward))

interface FormRow {
  type: CompetitionAwardType
  label: string
  note: string
  link: string
  currentUrl: string | null
  dataUrl?: string
  cleared?: boolean
}
const editing = ref(false)
const form = ref<FormRow[]>([])

function openEdit() {
  const byType = new Map((standings.data.value ?? []).map((s) => [s.type, s.reward]))
  form.value = COMPETITION_AWARD_TYPES.map((type) => {
    const r = byType.get(type)
    return { type, label: r?.label ?? '', note: r?.note ?? '', link: r?.link ?? '', currentUrl: r?.imageUrl ?? null }
  })
  editing.value = true
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

async function submit() {
  const items: LeagueRewardInput[] = form.value.map((r) => ({
    type: r.type,
    label: r.label,
    imageDataUrl: r.dataUrl ?? (r.cleared ? null : undefined),
    note: r.note.trim() || null,
    link: r.link.trim() || null,
  }))
  await save.mutateAsync(items)
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
        class="rounded-lg border p-3 flex gap-3"
        :style="`border-color: ${s.youHold ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}`"
      >
        <img v-if="s.reward!.imageUrl" :src="s.reward!.imageUrl" class="w-14 h-14 rounded object-cover shrink-0" alt="" >
        <i v-else class="pi pi-gift text-2xl shrink-0" style="color: var(--p-primary-color)" />
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ criterionName(s.type, s.teamCode) }}</div>
          <div class="font-semibold leading-tight">{{ s.reward!.label }}</div>
          <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">
            <template v-if="s.winners.length > 0">
              {{ t('reward.currentLeader') }}: {{ leaderNames(s.winners) }}
              <span v-if="s.youHold" class="font-semibold" style="color: var(--p-primary-color)"> - {{ t('reward.you') }}</span>
            </template>
            <template v-else>{{ t('reward.noLeader') }}</template>
          </div>
          <a v-if="s.reward!.link" :href="s.reward!.link" target="_blank" rel="noopener" class="text-xs hover:underline" style="color: var(--p-primary-color)">{{ t('reward.details') }}</a>
          <div v-if="s.reward!.note" class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ s.reward!.note }}</div>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="editing" modal :header="t('reward.title')" class="w-[95vw] max-w-2xl">
      <div class="flex flex-col gap-4">
        <div v-for="row in form" :key="row.type" class="border-b pb-3 last:border-b-0" style="border-color: var(--p-content-border-color)">
          <div class="text-sm font-semibold mb-1">{{ criterionName(row.type, null) }}</div>
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
              <InputText v-model="row.note" :placeholder="t('reward.note')" size="small" />
              <InputText v-model="row.link" :placeholder="t('reward.link')" size="small" />
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button severity="secondary" :label="t('common.cancel')" @click="editing = false" />
        <Button :label="t('reward.save')" icon="pi pi-check" :loading="save.isPending.value" @click="submit" />
      </template>
    </Dialog>
  </section>
</template>
