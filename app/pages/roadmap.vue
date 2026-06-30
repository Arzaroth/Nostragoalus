<script setup lang="ts">
import type { RoadmapStatus } from '../composables/useRoadmap'
import { groupByStatus } from '../composables/useRoadmap'

const { t } = useI18n()
const { data: items, isPending, isError } = useRoadmap()

// Display order: what's moving first, then the queue, then the trophy shelf.
const sections: Array<{ status: RoadmapStatus; key: string; icon: string; severity: string }> = [
  { status: 'IN_PROGRESS', key: 'roadmap.inProgress', icon: 'pi pi-spinner', severity: 'info' },
  { status: 'PLANNED', key: 'roadmap.planned', icon: 'pi pi-clock', severity: 'secondary' },
  { status: 'SHIPPED', key: 'roadmap.shipped', icon: 'pi pi-check-circle', severity: 'success' },
]
const byStatus = computed(() => groupByStatus(items.value))

useHead({ title: t('roadmap.title') })
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t('roadmap.title') }}</h1>
      <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('roadmap.sub') }}</p>
    </div>

    <div v-if="isPending" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="isError" class="opacity-60">{{ t('roadmap.error') }}</div>

    <template v-else>
      <section
        v-for="section in sections"
        :key="section.status"
        class="ng-card rounded-2xl border overflow-hidden"
        style="background: var(--p-content-background)"
      >
        <div class="px-6 py-4 flex items-center gap-2 border-b" style="border-color: var(--p-content-border-color)">
          <Tag :severity="section.severity" rounded>
            <i :class="section.icon" class="text-xs me-1" />{{ t(section.key) }}
          </Tag>
          <span class="text-xs" style="color: var(--p-text-muted-color)">{{ byStatus[section.status].length }}</span>
        </div>
        <div v-if="!byStatus[section.status].length" class="px-6 py-4 text-sm opacity-60">
          {{ t('roadmap.empty') }}
        </div>
        <div
          v-for="item in byStatus[section.status]"
          :key="item.id"
          class="px-6 py-3 border-t first:border-t-0 text-sm"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="font-medium" :class="section.status === 'SHIPPED' ? 'opacity-80' : ''">{{ item.title }}</div>
          <p v-if="item.description" class="text-xs mt-1 whitespace-pre-line" style="color: var(--p-text-muted-color)">
            {{ item.description }}
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
