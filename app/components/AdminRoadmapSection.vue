<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AdminRoadmapItem, RoadmapModeration, RoadmapStatus } from '../composables/useRoadmap'
import { ROADMAP_COLUMNS, groupByStatus } from '../composables/useRoadmap'

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

const actionErr = ref('')
const onActionError = (e: any) => {
  actionErr.value = e?.data?.statusMessage || t('admin.roadmap.actionFailed')
}

// Cross-column moves via the Select stay keyboard-accessible alongside drag.
const statusOptions = computed(() => [
  { label: t('roadmap.planned'), value: 'PLANNED' },
  { label: t('roadmap.inProgress'), value: 'IN_PROGRESS' },
  { label: t('roadmap.shipped'), value: 'SHIPPED' },
  { label: t('roadmap.suggested'), value: 'SUGGESTED' },
])
// Admin-authored items go on the roadmap proper, never into the community bucket.
const createStatusOptions = computed(() => statusOptions.value.filter((o) => o.value !== 'SUGGESTED'))
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

// Kanban drag: persist the whole target column's order in one request. The
// cache is patched optimistically so the card lands where it was dropped without
// waiting for the refetch; onError resyncs from the server (discarding the
// optimistic patch) so a failed reorder can't leave a stale order on screen.
const reorderMutation = useMutation({
  mutationFn: (input: { status: RoadmapStatus; ids: string[] }) =>
    $fetch<unknown>('/api/admin/roadmap/reorder', { method: 'PUT', body: input }),
  onSuccess: () => {
    actionErr.value = ''
    invalidate()
  },
  onError: (e: unknown) => {
    onActionError(e)
    invalidate()
  },
})

const dragId = ref<string | null>(null)
const dragOverCol = ref<RoadmapStatus | null>(null)

function onDragStart(item: AdminRoadmapItem, e: DragEvent) {
  dragId.value = item.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
  }
}
function onDragEnd() {
  dragId.value = null
  dragOverCol.value = null
}

function applyLocal(status: RoadmapStatus, ids: string[]) {
  const pos = new Map(ids.map((id, i) => [id, i]))
  queryClient.setQueryData<AdminRoadmapItem[]>(['admin-roadmap'], (old) =>
    old
      ?.map((it) =>
        pos.has(it.id)
          ? {
              ...it,
              status,
              position: pos.get(it.id)!,
              // Same promotion rule as the server (blessedModerationOnPromote):
              // a card dragged onto the roadmap proper un-hides even a rejected one.
              moderationStatus:
                status !== 'SUGGESTED' && it.moderationStatus !== 'APPROVED' ? 'APPROVED' : it.moderationStatus,
            }
          : it,
      )
      // groupByStatus buckets in array order and does not sort by position, so the
      // card only visibly moves if the array itself reflects the new order.
      .sort((x, y) => x.position - y.position),
  )
}

// Drop the dragged card into `status`, before `beforeItem` (or at the column end
// when dropped on empty space).
function onDrop(status: RoadmapStatus, beforeItem: AdminRoadmapItem | null) {
  const id = dragId.value
  dragOverCol.value = null
  if (!id || (beforeItem && beforeItem.id === id)) {
    dragId.value = null
    return
  }
  const rest = grouped.value[status].filter((i) => i.id !== id).map((i) => i.id)
  const at = beforeItem ? rest.indexOf(beforeItem.id) : rest.length
  const ids = [...rest.slice(0, at), id, ...rest.slice(at)]
  dragId.value = null
  applyLocal(status, ids)
  reorderMutation.mutate({ status, ids })
}

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
        <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.roadmap.boardHint') }}</p>
      </div>
    </div>

    <div class="border-t p-4" style="border-color: var(--p-content-border-color)">
      <Message v-if="actionErr" severity="error" size="small" class="mb-3">{{ actionErr }}</Message>
      <div v-if="isPending" class="opacity-60">{{ t('common.loading') }}</div>

      <div v-else class="flex gap-3 overflow-x-auto pb-2 items-start">
        <div
          v-for="col in ROADMAP_COLUMNS"
          :key="col.status"
          :data-status="col.status"
          class="ng-col shrink-0 w-64 self-stretch rounded-xl border flex flex-col"
          :class="dragOverCol === col.status ? 'ng-col-over' : ''"
          style="border-color: var(--p-content-border-color)"
          @dragover.prevent="dragOverCol = col.status"
          @drop="onDrop(col.status, null)"
        >
          <div class="px-3 py-2 flex items-center gap-2 border-b" style="border-color: var(--p-content-border-color)">
            <Tag :severity="col.severity" rounded><i :class="col.icon" class="text-xs me-1" />{{ t(col.key) }}</Tag>
            <span class="text-xs" style="color: var(--p-text-muted-color)">{{ grouped[col.status].length }}</span>
          </div>

          <div class="flex flex-col gap-2 p-2 min-h-16">
            <div
              v-for="item in grouped[col.status]"
              :key="item.id"
              draggable="true"
              class="ng-drag rounded-lg border p-2 text-sm cursor-grab active:cursor-grabbing"
              :class="[item.moderationStatus === 'REJECTED' ? 'opacity-50' : '', dragId === item.id ? 'opacity-40' : '']"
              style="border-color: var(--p-content-border-color); background: var(--p-content-background)"
              @dragstart="onDragStart(item, $event)"
              @dragend="onDragEnd"
              @dragover.prevent="dragOverCol = col.status"
              @drop.stop="onDrop(col.status, item)"
            >
              <div class="flex items-start gap-2">
                <span
                  v-tooltip.top="t('roadmap.votes', { n: item.voteCount })"
                  class="shrink-0 inline-flex items-center gap-0.5 text-xs tabular-nums mt-0.5"
                  style="color: var(--p-text-muted-color)"
                >
                  <i class="pi pi-caret-up text-xs" />{{ item.voteCount }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="font-medium flex items-center gap-1">
                    <i v-if="item.authorId" v-tooltip.top="t('admin.roadmap.userSuggestion')" class="pi pi-user text-xs shrink-0" style="color: var(--p-text-muted-color)" />
                    <span class="truncate">{{ item.title }}</span>
                  </div>
                  <Tag v-if="item.moderationStatus === 'PENDING'" severity="warn" rounded class="mt-1">
                    <i class="pi pi-hourglass text-xs me-1" />{{ t('roadmap.underReview') }}
                  </Tag>
                  <div v-if="item.description" class="text-xs truncate mt-0.5" style="color: var(--p-text-muted-color)">{{ item.description }}</div>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1 mt-2">
                <Select
                  :model-value="item.status"
                  :options="statusOptions"
                  option-label="label"
                  option-value="value"
                  size="small"
                  class="grow-0"
                  @update:model-value="(v: RoadmapStatus) => setStatus(item, v)"
                />
                <Button
                  v-if="item.moderationStatus === 'PENDING'"
                  icon="pi pi-check"
                  severity="success"
                  text
                  rounded
                  size="small"
                  :aria-label="t('admin.roadmap.approve')"
                  @click="setModeration(item, 'APPROVED')"
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
            </div>

            <div v-if="!grouped[col.status].length" class="text-xs opacity-50 px-1 py-3">{{ t('roadmap.empty') }}</div>
          </div>
        </div>
      </div>
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

<style scoped>
.ng-col {
  background: color-mix(in srgb, var(--p-content-border-color) 12%, transparent);
  transition: outline-color 0.15s;
  outline: 2px solid transparent;
}
.ng-col-over {
  outline-color: var(--p-primary-color);
}
</style>
