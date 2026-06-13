<script setup lang="ts">
interface CronRow {
  name: string
  schedule: string | null
  nextRunAt: string | null
  previousRunAt: string | null
  lastRunAt: string | null
  lastFailureAt: string | null
  lastDurationMs: number | null
  executions: number
  lastResult: string | null
  lastError: string | null
  status: 'ok' | 'failed' | 'never'
}

const { t, locale } = useI18n()
useHead({ title: () => t('cron.title') })

const { data: status } = await useFetch<{ isAdmin: boolean }>('/api/admin/status')
const isAdmin = computed(() => status.value?.isAdmin === true)

const { data, refresh, status: fetchStatus } = await useFetch<{ tasks: CronRow[] }>('/api/admin/cron', { lazy: true })
const tasks = computed(() => data.value?.tasks ?? [])

// Human label per task; the raw name (e.g. scores:poll) shows underneath.
const LABELS: Record<string, string> = {
  'scores:poll': t('cron.task.scoresPoll'),
  'fixtures:refresh': t('cron.task.fixturesRefresh'),
  'matches:finalize': t('cron.task.matchesFinalize'),
  'odds:refresh': t('cron.task.oddsRefresh'),
  'odds:backfill': t('cron.task.oddsBackfill'),
  'fixtures:import': t('cron.task.fixturesImport'),
}
const labelOf = (name: string) => LABELS[name] ?? name

// Relative time, localized, re-rendered on a 30s tick (the table doesn't need
// per-second precision).
const nowTick = useTimestamp({ interval: 30_000 })
const rtf = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))
function relative(iso: string | null): string {
  if (!iso) return '-'
  const diffMs = new Date(iso).getTime() - nowTick.value
  const abs = Math.abs(diffMs)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.value.format(Math.round(diffMs / ms), unit)
  }
  return '-'
}
function absolute(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(locale.value) : '-'
}
function durationLabel(ms: number | null): string {
  if (ms == null) return '-'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

// Run-now per task; refresh the table when it settles.
const running = ref<string | null>(null)
async function run(name: string) {
  if (running.value) return
  running.value = name
  try {
    await $fetch('/api/admin/run-task', { method: 'POST', body: { name } })
  } catch {
    // the row's Result cell surfaces the failure on refresh
  } finally {
    running.value = null
    await refresh()
  }
}

// Result cell -> dialog with the last output / error. Track by name and derive
// the row from the live list, so a refresh (run-now / the 30s tick) updates the
// open dialog instead of freezing it on the row captured at open time.
const selectedName = ref<string | null>(null)
const selected = computed(() => (selectedName.value ? tasks.value.find((t) => t.name === selectedName.value) ?? null : null))
const dialogOpen = computed({
  get: () => selected.value !== null,
  set: (v: boolean) => {
    if (!v) selectedName.value = null
  },
})

function resultIcon(s: CronRow['status']): string {
  return s === 'ok' ? 'pi pi-check' : s === 'failed' ? 'pi pi-times' : 'pi pi-minus'
}
function resultColor(s: CronRow['status']): string {
  return s === 'ok' ? 'var(--ng-success)' : s === 'failed' ? 'var(--ng-danger)' : 'var(--p-text-muted-color)'
}
function resultTooltip(r: CronRow): string {
  if (r.status === 'never') return t('cron.tip.never')
  const lines = [
    t(`cron.status.${r.status}`),
    `${t('cron.col.previous')}: ${absolute(r.previousRunAt)}`,
    `${t('cron.dialog.duration')}: ${durationLabel(r.lastDurationMs)}`,
  ]
  if (r.lastError) lines.push(`${t('cron.dialog.error')}: ${r.lastError.slice(0, 120)}`)
  return lines.join('\n')
}
</script>

<template>
  <div class="max-w-4xl mx-auto flex flex-col gap-6">
    <div class="flex items-center gap-3">
      <NuxtLink to="/admin" class="text-sm inline-flex items-center gap-1 hover:underline" style="color: var(--p-text-muted-color)">
        <i class="pi pi-arrow-left" /> {{ t('nav.admin') }}
      </NuxtLink>
    </div>
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">{{ t('cron.title') }}</h1>
        <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('cron.hint') }}</p>
      </div>
      <Button :label="t('common.refresh')" icon="pi pi-refresh" size="small" severity="secondary" outlined :loading="fetchStatus === 'pending'" @click="() => refresh()" />
    </div>

    <div v-if="!isAdmin" class="ng-card rounded-2xl border p-6 opacity-70" style="background: var(--p-content-background)">
      {{ t('admin.forbidden') }}
    </div>

    <section v-else class="ng-card rounded-2xl border overflow-x-auto" style="background: var(--p-content-background)">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left" style="color: var(--p-text-muted-color); border-bottom: 1px solid var(--p-content-border-color)">
            <th class="p-3 font-medium w-10" />
            <th class="p-3 font-medium">{{ t('cron.col.name') }}</th>
            <th class="p-3 font-medium">{{ t('cron.col.schedule') }}</th>
            <th class="p-3 font-medium">{{ t('cron.col.next') }}</th>
            <th class="p-3 font-medium">{{ t('cron.col.previous') }}</th>
            <th class="p-3 font-medium text-right">{{ t('cron.col.executions') }}</th>
            <th class="p-3 font-medium text-center">{{ t('cron.col.result') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in tasks" :key="r.name" style="border-bottom: 1px solid var(--p-content-border-color)">
            <td class="p-2 align-middle">
              <Button
                v-tooltip.right="t('cron.runNow')"
                icon="pi pi-play"
                rounded
                size="small"
                severity="secondary"
                :loading="running === r.name"
                :aria-label="t('cron.runNow')"
                @click="run(r.name)"
              />
            </td>
            <td class="p-3">
              <div class="font-medium">{{ labelOf(r.name) }}</div>
              <div class="text-xs tabular-nums" style="color: var(--p-text-muted-color)">{{ r.name }}</div>
            </td>
            <td class="p-3"><code v-if="r.schedule" class="text-xs">{{ r.schedule }}</code><span v-else style="color: var(--p-text-muted-color)">{{ t('cron.manual') }}</span></td>
            <td class="p-3"><span v-if="r.nextRunAt" v-tooltip.top="absolute(r.nextRunAt)" class="cursor-help">{{ relative(r.nextRunAt) }}</span><span v-else style="color: var(--p-text-muted-color)">-</span></td>
            <td class="p-3"><span v-if="r.previousRunAt" v-tooltip.top="absolute(r.previousRunAt)" class="cursor-help">{{ relative(r.previousRunAt) }}</span><span v-else style="color: var(--p-text-muted-color)">-</span></td>
            <td class="p-3 text-right tabular-nums">{{ r.executions }}</td>
            <td class="p-3 text-center">
              <button
                v-tooltip.left="resultTooltip(r)"
                type="button"
                class="inline-flex items-center justify-center w-7 h-7 rounded-full transition-opacity hover:opacity-70"
                :class="r.status === 'never' ? 'cursor-default' : 'cursor-pointer'"
                :disabled="r.status === 'never'"
                :aria-label="t(`cron.status.${r.status}`)"
                @click="r.status !== 'never' && (selectedName = r.name)"
              >
                <i :class="resultIcon(r.status)" :style="`color: ${resultColor(r.status)}`" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <Dialog v-model:visible="dialogOpen" modal :header="selected ? labelOf(selected.name) : ''" :style="{ width: '40rem', maxWidth: '95vw' }">
      <div v-if="selected" class="flex flex-col gap-3 text-sm">
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          <span style="color: var(--p-text-muted-color)">{{ t('cron.col.schedule') }}</span>
          <span><code v-if="selected.schedule" class="text-xs">{{ selected.schedule }}</code><template v-else>{{ t('cron.manual') }}</template></span>
          <span style="color: var(--p-text-muted-color)">{{ t('cron.dialog.lastRun') }}</span>
          <span>{{ absolute(selected.lastRunAt) }}</span>
          <span style="color: var(--p-text-muted-color)">{{ t('cron.dialog.duration') }}</span>
          <span>{{ durationLabel(selected.lastDurationMs) }}</span>
          <span style="color: var(--p-text-muted-color)">{{ t('cron.col.executions') }}</span>
          <span class="tabular-nums">{{ selected.executions }}</span>
          <template v-if="selected.lastFailureAt">
            <span style="color: var(--p-text-muted-color)">{{ t('cron.dialog.lastFailure') }}</span>
            <span>{{ absolute(selected.lastFailureAt) }}</span>
          </template>
        </div>
        <div v-if="selected.lastError">
          <div class="text-xs font-semibold mb-1" style="color: var(--ng-danger)">{{ t('cron.dialog.error') }}</div>
          <pre class="text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap" style="background: color-mix(in srgb, var(--ng-danger) 10%, transparent)">{{ selected.lastError }}</pre>
        </div>
        <div>
          <div class="text-xs font-semibold mb-1">{{ t('cron.dialog.output') }}</div>
          <pre v-if="selected.lastResult" class="text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap" style="background: color-mix(in srgb, var(--p-text-color) 6%, transparent)">{{ selected.lastResult }}</pre>
          <p v-else class="text-xs" style="color: var(--p-text-muted-color)">{{ t('cron.dialog.noOutput') }}</p>
        </div>
      </div>
    </Dialog>
  </div>
</template>
