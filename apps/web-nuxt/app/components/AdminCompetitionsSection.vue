<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{ isAdmin: boolean }>()
const { t } = useI18n()
const queryClient = useQueryClient()
const enabled = computed(() => props.isAdmin)
const meta = useCompetitionMeta()

interface CompetitionsConfig {
  competitions: { id: string; slug: string; name: string }[]
  defaultSlug: string
}

const { data, isPending } = useQuery({
  queryKey: ['admin-competitions'],
  enabled,
  queryFn: () => $fetch<CompetitionsConfig>('/api/competitions'),
})

const selected = ref('')
watch(
  () => data.value,
  (cfg) => {
    if (cfg) selected.value = cfg.defaultSlug
  },
  { immediate: true },
)

const dirty = computed(() => !!data.value && selected.value !== data.value.defaultSlug)
const err = ref('')
const saved = ref(false)

const saveMutation = useMutation({
  mutationFn: () =>
    $fetch<{ defaultSlug: string }>('/api/admin/competitions/default', {
      method: 'PUT',
      body: { competition: selected.value },
    }),
  onSuccess: async (res) => {
    err.value = ''
    saved.value = true
    // Every slug-less link in this session reads the SSR-seeded copy, so update
    // it here rather than leaving the admin on the previous default until reload.
    if (meta.value) meta.value = { ...meta.value, defaultSlug: res.defaultSlug }
    await queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })
  },
  onError: (e: any) => {
    saved.value = false
    err.value = e?.data?.message || e?.message || t('admin.competitions.saveFailed')
  },
})
</script>

<template>
  <section v-if="isAdmin" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6 flex flex-col gap-4">
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.intro') }}</p>

      <div v-if="isPending" class="text-sm" style="color: var(--p-text-muted-color)">…</div>
      <div v-else-if="!data || !data.competitions.length" class="text-sm" style="color: var(--p-text-muted-color)">
        {{ t('admin.competitions.none') }}
      </div>
      <div v-else class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.defaultLabel') }}</span>
          <select
            v-model="selected"
            class="rounded-lg border px-2 py-1.5 text-sm w-64"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <option v-for="c in data.competitions" :key="c.id" :value="c.slug">{{ c.name }} ({{ c.slug }})</option>
          </select>
        </label>
        <button
          type="button"
          :disabled="!dirty || saveMutation.isPending.value"
          class="px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
          @click="saveMutation.mutate()"
        >
          {{ t('admin.competitions.save') }}
        </button>
        <span v-if="saved && !dirty" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.competitions.saved') }}</span>
      </div>

      <span v-if="err" class="text-xs" style="color: var(--ng-danger)">{{ err }}</span>
    </div>
  </section>
</template>
