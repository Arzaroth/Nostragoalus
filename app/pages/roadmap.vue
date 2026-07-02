<script setup lang="ts">
import type { RoadmapItem, RoadmapStatus } from '../composables/useRoadmap'
import { ROADMAP_COLUMNS, groupByStatus, useRoadmapActions } from '../composables/useRoadmap'

const { t } = useI18n()
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data)

const { data: items, isPending, isError } = useRoadmap()
const { submit, vote } = useRoadmapActions()

const byStatus = computed(() => groupByStatus(items.value))
// Roadmap columns keep the admin-curated position order; the community column is
// ranked by demand instead.
function columnItems(status: RoadmapStatus): RoadmapItem[] {
  const list = byStatus.value[status]
  if (status === 'SUGGESTED') return [...list].sort((a, b) => b.voteCount - a.voteCount || a.position - b.position)
  return list
}

function onVote(item: RoadmapItem) {
  if (!signedIn.value || vote.isPending.value) return
  vote.mutate(item.id)
}

const suggestTitle = ref('')
const suggestDescription = ref('')
const submitErr = ref('')
const justSubmitted = ref(false)
function onSubmit() {
  submitErr.value = ''
  submit.mutate(
    { title: suggestTitle.value.trim(), description: suggestDescription.value.trim() || undefined },
    {
      onSuccess: () => {
        suggestTitle.value = ''
        suggestDescription.value = ''
        justSubmitted.value = true
      },
      onError: (e: any) => {
        submitErr.value = e?.data?.statusMessage || t('roadmap.suggest.failed')
      },
    },
  )
}

useHead({ title: t('roadmap.title') })
</script>

<template>
  <div class="max-w-6xl mx-auto flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t('roadmap.title') }}</h1>
      <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('roadmap.sub') }}</p>
    </div>

    <div v-if="isPending" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="isError" class="opacity-60">{{ t('roadmap.error') }}</div>

    <!-- Read-only kanban board: one column per status, horizontally scrollable when it
         outgrows the viewport. -->
    <div v-else class="flex gap-4 overflow-x-auto pb-2 items-start">
      <section
        v-for="col in ROADMAP_COLUMNS"
        :key="col.status"
        class="ng-card shrink-0 w-72 md:w-auto md:flex-1 rounded-2xl border overflow-hidden self-stretch"
        style="background: var(--p-content-background)"
      >
        <div class="px-4 py-3 flex items-center gap-2 border-b" style="border-color: var(--p-content-border-color)">
          <Tag :severity="col.severity" rounded>
            <i :class="col.icon" class="text-xs me-1" />{{ t(col.key) }}
          </Tag>
          <span class="text-xs" style="color: var(--p-text-muted-color)">{{ byStatus[col.status].length }}</span>
        </div>

        <div
          v-if="col.status === 'SUGGESTED'"
          class="px-4 py-3 border-b"
          style="border-color: var(--p-content-border-color)"
        >
          <form v-if="signedIn" class="flex flex-col gap-2" @submit.prevent="onSubmit">
            <InputText v-model="suggestTitle" :placeholder="t('roadmap.suggest.titleLabel')" maxlength="120" />
            <Textarea v-model="suggestDescription" rows="2" :placeholder="t('roadmap.suggest.descriptionLabel')" maxlength="2000" />
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                :label="t('roadmap.suggest.submit')"
                size="small"
                :loading="submit.isPending.value"
                :disabled="suggestTitle.trim().length < 3"
              />
              <span v-if="justSubmitted" class="text-xs" style="color: var(--p-primary-color)">
                {{ t('roadmap.suggest.thanks') }}
              </span>
            </div>
            <Message v-if="submitErr" severity="error" size="small">{{ submitErr }}</Message>
          </form>
          <p v-else class="text-sm opacity-70">
            {{ t('roadmap.suggest.signInHint') }}
            <NuxtLink to="/login" class="underline">{{ t('roadmap.suggest.signInCta') }}</NuxtLink>
          </p>
        </div>

        <div v-if="!columnItems(col.status).length" class="px-4 py-4 text-sm opacity-60">
          {{ col.status === 'SUGGESTED' ? t('roadmap.suggest.empty') : t('roadmap.empty') }}
        </div>
        <div
          v-for="item in columnItems(col.status)"
          :key="item.id"
          class="ng-roadmap-card px-4 py-3 border-t first:border-t-0 text-sm flex items-start gap-3"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium flex flex-wrap items-center gap-2" :class="col.status === 'SHIPPED' ? 'opacity-80' : ''">
              <span>{{ item.title }}</span>
              <Tag v-if="item.underReview" severity="warn" rounded class="shrink-0">
                <i class="pi pi-hourglass text-xs me-1" />{{ t('roadmap.underReview') }}
              </Tag>
            </div>
            <p v-if="item.description" class="text-xs mt-1 whitespace-pre-line" style="color: var(--p-text-muted-color)">
              {{ item.description }}
            </p>
          </div>
          <button
            v-tooltip.top="signedIn ? t(item.viewerHasVoted ? 'roadmap.upvoteRemove' : 'roadmap.upvote') : t('roadmap.signInToVote')"
            type="button"
            class="ng-vote shrink-0 flex flex-col items-center justify-center rounded-lg border px-2.5 py-1 leading-none transition-colors"
            :class="item.viewerHasVoted ? 'ng-vote-active' : ''"
            :aria-pressed="item.viewerHasVoted"
            :aria-label="t('roadmap.votes', { n: item.voteCount })"
            :disabled="vote.isPending.value"
            @click="onVote(item)"
          >
            <i class="pi pi-caret-up text-xs" />
            <span class="text-xs font-semibold mt-0.5">{{ item.voteCount }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ng-vote {
  border-color: var(--p-content-border-color);
  color: var(--p-text-muted-color);
  min-width: 3rem;
}
.ng-vote:hover:not(:disabled) {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}
.ng-vote-active {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
.ng-vote:disabled {
  cursor: default;
}
</style>
