<script setup lang="ts">
import { matchIsInPlay, matchHasStarted, type MatchStatus } from '#shared/types/match'
import type { MatchListItem } from '../../composables/useMatches'

const props = defineProps<{ visible: boolean; disabledIds?: string[] }>()
const emit = defineEmits<{ 'update:visible': [boolean]; select: [string] }>()

const { t, locale } = useI18n()
const { data: matches } = useMatches()

type Filter = 'all' | 'live' | 'upcoming' | 'finished'
const FILTERS: Filter[] = ['all', 'live', 'upcoming', 'finished']
const FILTER_KEY: Record<Filter, string> = {
  all: 'multiview.filterAll',
  live: 'matches.filterStatus.live',
  upcoming: 'matches.filterStatus.upcoming',
  finished: 'matches.filterStatus.fulltime',
}
const query = ref('')
const filter = ref<Filter>('all')

function bucketOf(status: string): Exclude<Filter, 'all'> {
  if (matchIsInPlay(status as MatchStatus)) return 'live'
  if (matchHasStarted(status as MatchStatus)) return 'finished'
  return 'upcoming'
}

const disabled = computed(() => new Set(props.disabledIds ?? []))

const rows = computed(() => {
  const q = searchable(query.value)
  return (matches.value ?? [])
    .filter((m) => filter.value === 'all' || bucketOf(m.status) === filter.value)
    .filter((m) => !q || searchable(`${m.homeTeam} ${m.awayTeam}`).includes(q))
    .slice()
    .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())
})

function fmtTime(d: string) {
  return new Date(d).toLocaleString(locale.value, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function pick(m: MatchListItem) {
  if (disabled.value.has(m.id)) return
  emit('select', m.id)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('multiview.addMatch')"
    :style="{ width: '32rem', maxWidth: '95vw' }"
    :dismissable-mask="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-3">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="query" :placeholder="t('matches.search')" class="w-full" autofocus />
      </IconField>
      <SelectButton
        :model-value="filter"
        :options="FILTERS"
        :allow-empty="false"
        size="small"
        @update:model-value="(v) => v && (filter = v)"
      >
        <template #option="{ option }">{{ t(FILTER_KEY[option as Filter]) }}</template>
      </SelectButton>

      <div class="flex flex-col max-h-[55vh] overflow-y-auto overscroll-contain -mx-2">
        <div v-if="!rows.length" class="text-sm text-center py-6" style="color: var(--p-text-muted-color)">{{ t('matches.noResults') }}</div>
        <button
          v-for="m in rows"
          :key="m.id"
          type="button"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-2 text-start transition"
          :class="disabled.has(m.id) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10'"
          :disabled="disabled.has(m.id)"
          @click="pick(m)"
        >
          <span class="flex items-center gap-2 min-w-0">
            <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-5 h-5 rounded object-cover shrink-0" alt="" >
            <span class="truncate">{{ m.homeTeam }}</span>
            <span class="opacity-50 shrink-0">-</span>
            <span class="truncate">{{ m.awayTeam }}</span>
            <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-5 h-5 rounded object-cover shrink-0" alt="" >
          </span>
          <span class="flex items-center gap-2 shrink-0">
            <span v-if="m.fullTimeHome !== null" class="tabular-nums font-semibold">{{ m.fullTimeHome }}–{{ m.fullTimeAway }}</span>
            <span v-else class="text-xs" style="color: var(--p-text-muted-color)">{{ fmtTime(m.kickoffTime) }}</span>
            <Tag :value="matchStatusLabel(m.status, t)" :severity="statusSeverity(m.status)" />
          </span>
        </button>
      </div>
    </div>
  </Dialog>
</template>
