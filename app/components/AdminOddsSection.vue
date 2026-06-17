<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{ isAdmin: boolean }>()
const { t } = useI18n()
const queryClient = useQueryClient()
const enabled = computed(() => props.isAdmin)

interface ProviderInfo {
  key: string
  fetchesOdds: boolean
}
interface CompetitionRow {
  id: string
  slug: string
  name: string
  oddsProvider: string | null
  oddsProviderRef: string | null
}
interface OddsConfig {
  providers: ProviderInfo[]
  competitions: CompetitionRow[]
}

const { data, isPending } = useQuery({
  queryKey: ['admin-odds'],
  enabled,
  queryFn: () => $fetch<OddsConfig>('/api/admin/odds'),
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-odds'] })

// Per-competition working copy, seeded from the server and edited locally until
// the row's Save fires.
const draft = reactive<Record<string, { provider: string; providerRef: string }>>({})
watch(
  () => data.value,
  (cfg) => {
    if (!cfg) return
    for (const c of cfg.competitions) {
      draft[c.id] = { provider: c.oddsProvider ?? '', providerRef: c.oddsProviderRef ?? '' }
    }
  },
  { immediate: true },
)

const fetchesOdds = (key: string): boolean => !!data.value?.providers.find((p) => p.key === key)?.fetchesOdds
const err = ref('')

const saveMutation = useMutation({
  mutationFn: (c: CompetitionRow) => {
    const d = draft[c.id]
    return $fetch<CompetitionRow>('/api/admin/odds', {
      method: 'PUT',
      body: { competition: c.slug, provider: d.provider, providerRef: d.providerRef.trim() || null },
    })
  },
  onSuccess: () => {
    err.value = ''
    invalidate()
  },
  onError: (e: any) => {
    err.value = e?.data?.message || e?.message || t('admin.odds.saveFailed')
  },
})
</script>

<template>
  <section v-if="isAdmin" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6 flex flex-col gap-4">
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.odds.intro') }}</p>

      <div v-if="isPending" class="text-sm" style="color: var(--p-text-muted-color)">…</div>
      <div v-else-if="!data || !data.competitions.length" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.odds.none') }}</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr style="color: var(--p-text-muted-color)" class="text-left">
            <th class="py-1">{{ t('admin.odds.colCompetition') }}</th>
            <th>{{ t('admin.odds.colProvider') }}</th>
            <th>{{ t('admin.odds.colRef') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="c in data.competitions" :key="c.id">
          <tr v-if="draft[c.id]" class="border-t align-top" style="border-color: var(--p-content-border-color)">
            <td class="py-2 pr-3">
              <div class="font-medium">{{ c.name }}</div>
              <code class="text-xs" style="color: var(--p-text-muted-color)">{{ c.slug }}</code>
            </td>
            <td class="pr-3">
              <select v-model="draft[c.id].provider" :aria-label="t('admin.odds.colProvider')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
                <option v-for="p in data.providers" :key="p.key" :value="p.key">{{ t(`admin.odds.provider_${p.key}`) }}</option>
              </select>
              <div v-if="draft[c.id].provider && !fetchesOdds(draft[c.id].provider)" class="text-xs mt-1 flex items-start gap-1" style="color: var(--ng-warning, #b45309)">
                <i class="pi pi-exclamation-triangle mt-0.5" />
                <span>{{ t('admin.odds.noFetchWarn') }}</span>
              </div>
            </td>
            <td class="pr-3">
              <input v-model="draft[c.id].providerRef" type="text" maxlength="64" :placeholder="t('admin.odds.refPlaceholder')" :aria-label="t('admin.odds.colRef')" class="rounded-lg border px-2 py-1.5 text-sm w-28" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
            </td>
            <td class="text-right">
              <button
                type="button"
                :disabled="!draft[c.id].provider || saveMutation.isPending.value"
                class="px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
                @click="saveMutation.mutate(c)"
              >
                {{ t('admin.odds.save') }}
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
