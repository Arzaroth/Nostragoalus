<script setup lang="ts">
import type { RoadmapItem, RoadmapStatus } from '../composables/useRoadmap'
import { groupByStatus, useRoadmapActions } from '../composables/useRoadmap'

const { t } = useI18n()
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data)

const { data: items, isPending, isError } = useRoadmap()
const { submit, vote } = useRoadmapActions()

// Display order: what's moving first, then the queue, then the trophy shelf.
// The community suggestions column renders separately below (it owns the form).
const sections: Array<{ status: RoadmapStatus; key: string; icon: string; severity: string }> = [
  { status: 'IN_PROGRESS', key: 'roadmap.inProgress', icon: 'pi pi-spinner', severity: 'info' },
  { status: 'PLANNED', key: 'roadmap.planned', icon: 'pi pi-clock', severity: 'secondary' },
  { status: 'SHIPPED', key: 'roadmap.shipped', icon: 'pi pi-check-circle', severity: 'success' },
]
const byStatus = computed(() => groupByStatus(items.value))
// The community feed is ranked by demand, not curation order.
const suggestions = computed(() =>
  [...byStatus.value.SUGGESTED].sort((a, b) => b.voteCount - a.voteCount || a.position - b.position),
)

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
          class="px-6 py-3 border-t first:border-t-0 text-sm flex items-start gap-3"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium" :class="section.status === 'SHIPPED' ? 'opacity-80' : ''">{{ item.title }}</div>
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

      <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
        <div class="px-6 py-4 flex items-center gap-2 border-b" style="border-color: var(--p-content-border-color)">
          <Tag severity="contrast" rounded>
            <i class="pi pi-lightbulb text-xs me-1" />{{ t('roadmap.suggested') }}
          </Tag>
          <span class="text-xs" style="color: var(--p-text-muted-color)">{{ suggestions.length }}</span>
        </div>

        <div class="px-6 py-4 border-b" style="border-color: var(--p-content-border-color)">
          <form v-if="signedIn" class="flex flex-col gap-2" @submit.prevent="onSubmit">
            <InputText v-model="suggestTitle" :placeholder="t('roadmap.suggest.titleLabel')" maxlength="120" />
            <Textarea v-model="suggestDescription" rows="2" :placeholder="t('roadmap.suggest.descriptionLabel')" maxlength="2000" />
            <div class="flex items-center gap-2">
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

        <div v-if="!suggestions.length" class="px-6 py-4 text-sm opacity-60">{{ t('roadmap.suggest.empty') }}</div>
        <div
          v-for="item in suggestions"
          :key="item.id"
          class="px-6 py-3 border-t first:border-t-0 text-sm flex items-start gap-3"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium">{{ item.title }}</div>
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
    </template>
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
