<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { RoadmapItem, RoadmapStatus } from '../composables/useRoadmap'

const props = defineProps<{ isAdmin: boolean }>()

const { t } = useI18n()
const queryClient = useQueryClient()

const enabled = computed(() => props.isAdmin)
const { data: items, isPending } = useQuery({
  queryKey: ['roadmap'],
  enabled,
  queryFn: ({ signal }) => $fetch<{ items: RoadmapItem[] }>('/api/roadmap', { signal }).then((r) => r.items),
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roadmap'] })

const statusOptions = computed(() => [
  { label: t('roadmap.planned'), value: 'PLANNED' },
  { label: t('roadmap.inProgress'), value: 'IN_PROGRESS' },
  { label: t('roadmap.shipped'), value: 'SHIPPED' },
])
const grouped = computed(() => {
  const groups: Record<RoadmapStatus, RoadmapItem[]> = { IN_PROGRESS: [], PLANNED: [], SHIPPED: [] }
  for (const item of items.value ?? []) groups[item.status].push(item)
  return groups
})

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
  mutationFn: (input: { id: string; body: Partial<Pick<RoadmapItem, 'title' | 'description' | 'status' | 'position'>> }) =>
    $fetch<unknown>(`/api/admin/roadmap/${input.id}`, { method: 'PUT', body: input.body }),
  onSuccess: invalidate,
})
const setStatus = (item: RoadmapItem, status: RoadmapStatus) => updateMutation.mutate({ id: item.id, body: { status } })

// Swap positions with the neighbor in the same status group.
function move(item: RoadmapItem, dir: -1 | 1) {
  const siblings = grouped.value[item.status]
  const idx = siblings.findIndex((s) => s.id === item.id)
  const neighbor = siblings[idx + dir]
  if (!neighbor) return
  updateMutation.mutate({ id: item.id, body: { position: neighbor.position } })
  updateMutation.mutate({ id: neighbor.id, body: { position: item.position } })
}

const deleteMutation = useMutation({
  mutationFn: (id: string) => $fetch<unknown>(`/api/admin/roadmap/${id}`, { method: 'DELETE' }),
  onSuccess: invalidate,
})

// Edit dialog
const editing = ref<RoadmapItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
function startEdit(item: RoadmapItem) {
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
    <div class="grid md:grid-cols-3 gap-6 p-6">
      <div>
        <h2 class="font-semibold">{{ t('admin.roadmap.title') }}</h2>
        <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.roadmap.hint') }}</p>
      </div>
      <div class="md:col-span-2 flex flex-col gap-2">
        <InputText v-model="newTitle" :placeholder="t('admin.roadmap.titleLabel')" />
        <Textarea v-model="newDescription" rows="2" :placeholder="t('admin.roadmap.descriptionLabel')" />
        <div class="flex items-center gap-2">
          <SelectButton v-model="newStatus" :options="statusOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
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
      <div v-if="isPending" class="px-6 py-4 opacity-60">{{ t('common.loading') }}</div>
      <template v-for="opt in statusOptions" :key="opt.value">
        <div
          v-for="(item, idx) in grouped[opt.value as RoadmapStatus]"
          :key="item.id"
          class="flex items-center gap-3 px-6 py-2 border-t text-sm"
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
              @click="move(item, -1)"
            />
            <Button
              icon="pi pi-chevron-down"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="idx === grouped[opt.value as RoadmapStatus].length - 1"
              :aria-label="t('admin.roadmap.moveDown')"
              @click="move(item, 1)"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ item.title }}</div>
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
