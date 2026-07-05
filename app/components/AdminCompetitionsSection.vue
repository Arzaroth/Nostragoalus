<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AdminCompetitionDto } from '#shared/types/admin-competitions'

const props = defineProps<{ isAdmin: boolean }>()
const { t } = useI18n()
const queryClient = useQueryClient()
const enabled = computed(() => props.isAdmin)

const { data, isPending } = useQuery({
  queryKey: ['admin-competitions'],
  enabled,
  queryFn: () => $fetch<{ competitions: AdminCompetitionDto[] }>('/api/admin/competitions'),
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })

// Per-competition working copy ('' = no featured team), seeded from the server and
// edited locally until the row's Save fires.
const draft = reactive<Record<string, string>>({})
watch(
  () => data.value,
  (cfg) => {
    if (!cfg) return
    for (const c of cfg.competitions) draft[c.id] = c.featuredTeamCode ?? ''
  },
  { immediate: true },
)

const err = ref('')
const saveMutation = useMutation({
  mutationFn: (c: AdminCompetitionDto) =>
    $fetch<{ ok: boolean; competitions: AdminCompetitionDto[] }>('/api/admin/competitions', {
      method: 'PUT',
      body: { competition: c.slug, featuredTeamCode: draft[c.id] || null },
    }),
  onSuccess: () => {
    err.value = ''
    invalidate()
  },
  onError: (e: any) => {
    err.value = e?.data?.message || e?.message || t('admin.competitions.saveFailed')
  },
})
</script>

<template>
  <section v-if="isAdmin" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6 flex flex-col gap-4">
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.intro') }}</p>

      <div v-if="isPending" class="text-sm" style="color: var(--p-text-muted-color)">…</div>
      <div v-else-if="!data || !data.competitions.length" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.none') }}</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr style="color: var(--p-text-muted-color)">
            <th class="py-1 pe-3 text-start font-medium">{{ t('admin.competitions.colCompetition') }}</th>
            <th class="pe-3 text-start font-medium">{{ t('admin.competitions.colFeaturedTeam') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="c in data.competitions" :key="c.id">
            <tr v-if="draft[c.id] !== undefined" class="border-t align-top" style="border-color: var(--p-content-border-color)">
              <td class="py-2 pe-3">
                <div class="font-medium">{{ c.name }}</div>
                <code class="text-xs" style="color: var(--p-text-muted-color)">{{ c.slug }}</code>
              </td>
              <td class="pe-3">
                <select
                  v-model="draft[c.id]"
                  :aria-label="t('admin.competitions.colFeaturedTeam')"
                  :disabled="c.teams.length === 0"
                  class="rounded-lg border px-2 py-1.5 text-sm w-48 disabled:opacity-50"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                >
                  <option value="">{{ t('admin.competitions.noFeaturedTeam') }}</option>
                  <option v-for="team in c.teams" :key="team.code" :value="team.code">{{ team.name }} ({{ team.code }})</option>
                </select>
                <p v-if="c.teams.length === 0" class="text-xs mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.noTeams') }}</p>
              </td>
              <td class="text-end">
                <button
                  type="button"
                  :disabled="saveMutation.isPending.value"
                  class="px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                  style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
                  @click="saveMutation.mutate(c)"
                >
                  {{ t('admin.competitions.save') }}
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <span v-if="err" class="text-xs" style="color: var(--ng-danger)">{{ err }}</span>
    </div>
  </section>
</template>
