<script setup lang="ts">
import type { LedgerEntry } from '#shared/commitment'

const { t } = useI18n()
useHead({ title: t('verify.title') })

const { data, isPending, isError, refetch, isFetching } = useLedgerVerification()
const { state: witness, check: recheckWitness } = useTamperWatch()
onMounted(() => void recheckWitness())

const witnessSeverity = computed(() => {
  switch (witness.value.status) {
    case 'tampered':
    case 'rolled-back':
      return 'danger'
    case 'consistent':
      return 'success'
    default:
      return 'secondary'
  }
})
const firstSeen = computed(() => (witness.value.firstSeenAt ? new Date(witness.value.firstSeenAt).toLocaleDateString() : ''))

function short(hash: string): string {
  return `${hash.slice(0, 12)}…`
}

// Most recent first, capped so a long ledger doesn't blow up the DOM.
const recent = computed<LedgerEntry[]>(() => (data.value ? [...data.value.entries].reverse().slice(0, 25) : []))
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t('verify.title') }}</h1>
      <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('verify.sub') }}</p>
    </div>

    <section class="ng-card rounded-2xl border p-6 text-sm" style="background: var(--p-content-background)">
      <p class="whitespace-pre-line" style="color: var(--p-text-muted-color)">{{ t('verify.how') }}</p>
    </section>

    <section class="ng-card rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--p-content-background)">
      <div class="flex items-center justify-between gap-3">
        <span class="font-medium">{{ t('verify.resultTitle') }}</span>
        <Button size="small" outlined :loading="isFetching" :label="t('verify.reverify')" @click="() => refetch()" />
      </div>

      <div v-if="isPending" class="opacity-60">{{ t('verify.running') }}</div>
      <div v-else-if="isError" class="opacity-60">{{ t('verify.error') }}</div>
      <template v-else-if="data">
        <div class="flex items-center gap-2 flex-wrap">
          <Tag v-if="data.result.ok" severity="success" rounded>
            <i class="pi pi-shield text-xs mr-1" />{{ t('verify.ok') }}
          </Tag>
          <Tag v-else severity="danger" rounded>
            <i class="pi pi-exclamation-triangle text-xs mr-1" />{{ t('verify.tampered') }}
          </Tag>
          <span class="text-xs" style="color: var(--p-text-muted-color)">
            {{ t('verify.counts', { total: data.result.count, opened: data.openedCount }) }}
          </span>
        </div>
        <p v-if="!data.result.ok" class="text-xs" style="color: var(--p-text-muted-color)">
          {{ t('verify.failedAt', { seq: data.result.failedSeq ?? 0, reason: t(`verify.reason.${data.result.reason}`) }) }}
        </p>
        <div class="text-xs flex flex-col gap-1 mt-1">
          <span style="color: var(--p-text-muted-color)">{{ t('verify.head', { seq: data.head.seq }) }}</span>
          <code class="break-all font-mono" style="color: var(--p-text-muted-color)">{{ data.head.headHash }}</code>
          <span class="mt-1" style="color: var(--p-text-muted-color)">{{ t('verify.snapshotHint') }}</span>
        </div>
      </template>
    </section>

    <section class="ng-card rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--p-content-background)">
      <span class="font-medium">{{ t('verify.witness.title') }}</span>
      <div class="flex items-center gap-2 flex-wrap">
        <Tag :severity="witnessSeverity" rounded>
          <i
            class="text-xs mr-1"
            :class="witnessSeverity === 'danger' ? 'pi pi-exclamation-triangle' : witnessSeverity === 'success' ? 'pi pi-verified' : 'pi pi-eye'"
          />{{ t(`verify.witness.${witness.status}`) }}
        </Tag>
        <span v-if="witness.status === 'consistent'" class="text-xs" style="color: var(--p-text-muted-color)">
          {{ t('verify.witness.since', { date: firstSeen, from: witness.pinnedSeq ?? 0, to: witness.headSeq ?? 0 }) }}
        </span>
      </div>
      <p class="text-xs whitespace-pre-line" style="color: var(--p-text-muted-color)">{{ t('verify.witness.explain') }}</p>
    </section>

    <section
      v-if="data && recent.length"
      class="ng-card rounded-2xl border overflow-hidden"
      style="background: var(--p-content-background)"
    >
      <div class="px-6 py-4 border-b font-medium text-sm" style="border-color: var(--p-content-border-color)">
        {{ t('verify.recent') }}
      </div>
      <div
        v-for="e in recent"
        :key="e.seq"
        class="px-6 py-2 border-t first:border-t-0 text-xs flex items-center gap-3"
        style="border-color: var(--p-content-border-color)"
      >
        <span class="font-mono opacity-60 w-10 shrink-0">#{{ e.seq }}</span>
        <span class="font-mono opacity-60 shrink-0">{{ short(e.subject) }}</span>
        <span class="flex-1 truncate font-mono" style="color: var(--p-text-muted-color)">{{ short(e.commitment) }}</span>
        <Tag v-if="e.opened" severity="secondary" rounded>{{ e.homeGoals }} - {{ e.awayGoals }}</Tag>
        <Tag v-else severity="contrast" rounded>
          <i class="pi pi-lock text-xs mr-1" />{{ t('verify.sealed') }}
        </Tag>
      </div>
    </section>
  </div>
</template>
