<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AdminRoadmapItem, RoadmapModeration, RoadmapStatus } from '../composables/useRoadmap'
import { groupByStatus } from '../composables/useRoadmap'

const props = defineProps<{ isAdmin: boolean }>()

const { t } = useI18n()
const queryClient = useQueryClient()

const enabled = computed(() => props.isAdmin)
// Admin endpoint: includes hidden (rejected) items, author and vote counts so
// suggestions can be triaged. Kept on its own query key so it never collides
// with the public ['roadmap'] cache (which omits hidden items).
const { data: items, isPending } = useQuery({
  queryKey: ['admin-roadmap'],
  enabled,
  queryFn: ({ signal }) => $fetch<{ items: AdminRoadmapItem[] }>('/api/admin/roadmap', { signal }).then((r) => r.items),
})
// A moderation/status change shifts what the public page shows, so refresh both.
const invalidate = () => {
  queryClient.invalidateQueries({ queryKey: ['admin-roadmap'] })
  queryClient.invalidateQueries({ queryKey: ['roadmap'] })
}

// Surfaced for the status/reorder/delete actions (the create form has its own).
const actionErr = ref('')
const onActionError = (e: any) => {
  actionErr.value = e?.data?.statusMessage || t('admin.roadmap.actionFailed')
}

// The community column is triaged here too; admins promote a suggestion by
// picking a roadmap status for it.
const statusOptions = computed(() => [
  { label: t('roadmap.planned'), value: 'PLANNED' },
  { label: t('roadmap.inProgress'), value: 'IN_PROGRESS' },
  { label: t('roadmap.shipped'), value: 'SHIPPED' },
  { label: t('roadmap.suggested'), value: 'SUGGESTED' },
])
// Admin-authored items go on the roadmap proper, never into the community bucket.
const createStatusOptions = computed(() => statusOptions.value.slice(0, 3))
const grouped = computed(() => groupByStatus(items.value))

// Create form
const newTitle = ref('')
const newDescription = ref('')
const newStatus = ref<RoadmapStatus>('PLANNED')
const createErr = ref('')
const createMutation = useMutation({
  mutationFn: () =>
    $fetch<unknown>('/api/admin/roadmap', {
      method: 'POST',
      body: {
        title: newTitle.value.trim(),
        description: newDescription.value.trim() || undefined,
        status: newStatus.value,
      },
    }),
  onSuccess: () => {
    newTitle.value = ''
    newDescription.value = ''
    newStatus.value = 'PLANNED'
    createErr.value = ''
    invalidate()
  },
  onError: (e: any) => {
    createErr.value = e?.data?.statusMessage || 'Failed to add item'
  },
})

const updateMutation = useMutation({
  mutationFn: (input: {
    id: string
    body: Partial<Pick<AdminRoadmapItem, 'title' | 'description' | 'status' | 'position' | 'moderationStatus'>>
  }) => $fetch<unknown>(`/api/admin/roadmap/${input.id}`, { method: 'PUT', body: input.body }),
  onSuccess: () => {
    actionErr.value = ''
    invalidate()
  },
  onError: onActionError,
})
const setStatus = (item: AdminRoadmapItem, status: RoadmapStatus) =>
  updateMutation.mutate({ id: item.id, body: { status } })
const setModeration = (item: AdminRoadmapItem, moderationStatus: RoadmapModeration) =>
  updateMutation.mutate({ id: item.id, body: { moderationStatus } })

// Reorder atomically server-side (one request swaps with the neighbor) rather
// than firing two independent position writes that could leave the list corrupt.
const moveMutation = useMutation({
  mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
    $fetch<unknown>(`/api/admin/roadmap/${input.id}/move`, { method: 'POST', body: { direction: input.direction } }),
  onSuccess: () => {
    actionErr.value = ''
    invalidate()
  },
  onError: onActionError,
})
const move = (item: AdminRoadmapItem, direction: 'up' | 'down') => moveMutation.mutate({ id: item.id, direction })

const deleteMutation = useMutation({
  mutationFn: (id: string) => $fetch<unknown>(`/api/admin/roadmap/${id}`, { method: 'DELETE' }),
  onSuccess: () => {
    actionErr.value = ''
    invalidate()
  },
  onError: onActionError,
})

// Edit dialog
const editing = ref<AdminRoadmapItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
function startEdit(item: AdminRoadmapItem) {
  editing.value = item
  editTitle.value = item.title
  editDescription.value = item.description ?? ''
}
function saveEdit() {
  if (!editing.value) return
  updateMutation.mutate({
    id: editing.value.id,
    body: { title: editTitle.value.trim(), description: editDescription.value.trim() || null },
  })
  editing.value = null
}
</script>

<template>
  <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6">
      <div class="flex flex-col gap-2">
        <InputText v-model="newTitle" :placeholder="t('admin.roadmap.titleLabel')" />
        <Textarea v-model="newDescription" rows="2" :placeholder="t('admin.roadmap.descriptionLabel')" />
        <div class="flex items-center gap-2">
          <SelectButton v-model="newStatus" :options="createStatusOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
          <Button
            :label="t('admin.roadmap.add')"
            size="small"
            :loading="createMutation.isPending.value"
            :disabled="newTitle.trim().length < 3"
            @click="createMutation.mutate()"
          />
        </div>
        <Message v-if="createErr" severity="error" size="small">{{ createErr }}</Message>
      </div>
    </div>

    <div class="border-t" style="border-color: var(--p-content-border-color)">
      <Message v-if="actionErr" severity="error" size="small" class="mx-6 mt-3">{{ actionErr }}</Message>
      <div v-if="isPending" class="px-6 py-4 opacity-60">{{ t('common.loading') }}</div>
      <template v-for="opt in statusOptions" :key="opt.value">
        <div
          v-for="(item, idx) in grouped[opt.value as RoadmapStatus]"
          :key="item.id"
          class="flex items-center gap-3 px-6 py-2 border-t text-sm"
          :class="item.moderationStatus === 'REJECTED' ? 'opacity-50' : ''"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="flex flex-col">
            <Button
              icon="pi pi-chevron-up"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="idx === 0"
              :aria-label="t('admin.roadmap.moveUp')"
              @click="move(item, 'up')"
            />
            <Button
              icon="pi pi-chevron-down"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="idx === grouped[opt.value as RoadmapStatus].length - 1"
              :aria-label="t('admin.roadmap.moveDown')"
              @click="move(item, 'down')"
            />
          </div>
          <span
            v-tooltip.top="t('roadmap.votes', { n: item.voteCount })"
            class="shrink-0 inline-flex items-center gap-1 text-xs tabular-nums"
            style="color: var(--p-text-muted-color)"
          >
            <i class="pi pi-caret-up text-xs" />{{ item.voteCount }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate flex items-center gap-1">
              <i v-if="item.authorId" v-tooltip.top="t('admin.roadmap.userSuggestion')" class="pi pi-user text-xs shrink-0" style="color: var(--p-text-muted-color)" />
              <span class="truncate">{{ item.title }}</span>
            </div>
            <div v-if="item.description" class="text-xs truncate" style="color: var(--p-text-muted-color)">{{ item.description }}</div>
          </div>
          <Select
            :model-value="item.status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="(v: RoadmapStatus) => setStatus(item, v)"
          />
          <Button
            v-if="item.moderationStatus === 'REJECTED'"
            icon="pi pi-eye"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="t('admin.roadmap.restore')"
            @click="setModeration(item, 'APPROVED')"
          />
          <Button
            v-else
            icon="pi pi-eye-slash"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="t('admin.roadmap.hide')"
            @click="setModeration(item, 'REJECTED')"
          />
          <Button icon="pi pi-pencil" severity="secondary" text rounded size="small" :aria-label="t('admin.roadmap.edit')" @click="startEdit(item)" />
          <Button icon="pi pi-trash" severity="danger" text rounded size="small" :aria-label="t('admin.roadmap.delete')" @click="deleteMutation.mutate(item.id)" />
        </div>
      </template>
    </div>

    <Dialog :visible="!!editing" modal :header="t('admin.roadmap.edit')" :style="{ width: '28rem' }" @update:visible="editing = null">
      <div class="flex flex-col gap-2">
        <InputText v-model="editTitle" :placeholder="t('admin.roadmap.titleLabel')" />
        <Textarea v-model="editDescription" rows="4" :placeholder="t('admin.roadmap.descriptionLabel')" />
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" severity="secondary" outlined size="small" @click="editing = null" />
        <Button :label="t('admin.roadmap.save')" size="small" :disabled="editTitle.trim().length < 3" @click="saveEdit" />
      </template>
    </Dialog>
  </section>
</template>
