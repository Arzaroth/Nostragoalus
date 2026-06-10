<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { LeagueMember, LeagueRole, LeagueVisibility } from '../composables/useLeagues'

const props = defineProps<{ isAdmin: boolean }>()

interface AdminLeague {
  id: string
  name: string
  visibility: LeagueVisibility
  joinCode: string
  memberCount: number
  competition: { id: string; slug: string; name: string }
  owner: { userId: string; name: string } | null
  autoJoinProviderIds: string[]
}

const { t } = useI18n()
const { admin } = useAuth()
const queryClient = useQueryClient()
const { data: competitions } = useCompetitions()

const filterSlug = ref<string | null>(null)
const filterOptions = computed(() => [
  { label: t('leaderboard.global'), value: null },
  ...(competitions.value ?? []).map((c) => ({ label: c.name, value: c.slug })),
])

const enabled = computed(() => props.isAdmin)
const { data: leaguesData, isPending } = useQuery({
  queryKey: ['admin-leagues', filterSlug],
  enabled,
  queryFn: ({ signal }) =>
    $fetch<{ leagues: AdminLeague[] }>('/api/admin/leagues', {
      query: filterSlug.value ? { competition: filterSlug.value } : {},
      signal,
    }).then((r) => r.leagues),
})
const leagues = computed(() => leaguesData.value ?? [])

function invalidate(membershipChanged = false) {
  queryClient.invalidateQueries({ queryKey: ['admin-leagues'] })
  queryClient.invalidateQueries({ queryKey: ['leagues'] })
  if (membershipChanged) queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
}

// Create form
const createName = ref('')
const createSlug = ref<string | null>(null)
const createPublic = ref(false)
const createErr = ref('')
const createMutation = useMutation({
  mutationFn: () =>
    $fetch<unknown>('/api/admin/leagues', {
      method: 'POST',
      body: {
        competition: createSlug.value,
        name: createName.value.trim(),
        visibility: createPublic.value ? 'PUBLIC' : 'PRIVATE',
      },
    }),
  onSuccess: () => {
    createName.value = ''
    createErr.value = ''
    invalidate()
  },
  onError: (e: any) => {
    createErr.value = e?.data?.statusMessage || 'Failed to create league'
  },
})

const visibilityMutation = useMutation({
  mutationFn: (l: AdminLeague) =>
    $fetch<unknown>(`/api/admin/leagues/${l.id}`, {
      method: 'PUT',
      body: { visibility: l.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' },
    }),
  onSuccess: () => invalidate(),
})

const confirmDelete = ref<AdminLeague | null>(null)
const deleteMutation = useMutation({
  mutationFn: (id: string) => $fetch<unknown>(`/api/admin/leagues/${id}`, { method: 'DELETE' }),
  onSuccess: () => invalidate(true),
})

const confirmPrune = ref(false)
const prunedCount = ref<number | null>(null)
const pruneMutation = useMutation({
  mutationFn: () => $fetch<{ pruned: number }>('/api/admin/leagues/prune', { method: 'POST' }),
  onSuccess: (r) => {
    prunedCount.value = r.pruned
    invalidate(true)
  },
})

// Member management dialog
const managing = ref<AdminLeague | null>(null)
const managingId = computed(() => managing.value?.id ?? null)
const { data: detail } = useQuery({
  queryKey: ['admin-leagues', 'detail', managingId],
  enabled: computed(() => !!managingId.value),
  queryFn: ({ signal }) =>
    $fetch<{ league: AdminLeague; members: LeagueMember[] }>(`/api/admin/leagues/${managingId.value}`, { signal }),
})

const { data: usersData } = useQuery({
  queryKey: ['admin-users'],
  enabled,
  queryFn: async () => {
    const res = await admin.listUsers({ query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' } })
    return (res.data as { users?: Array<{ id: string; name: string; email: string }> } | null)?.users ?? []
  },
})
const addCandidates = computed(() => {
  const memberIds = new Set((detail.value?.members ?? []).map((m) => m.userId))
  return (usersData.value ?? []).filter((u) => !memberIds.has(u.id)).map((u) => ({ label: `${u.name} (${u.email})`, value: u.id }))
})
const addUserId = ref<string | null>(null)

const invalidateDetail = () => {
  queryClient.invalidateQueries({ queryKey: ['admin-leagues'] })
  queryClient.invalidateQueries({ queryKey: ['leagues'] })
  queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
}
const addMutation = useMutation({
  mutationFn: () =>
    $fetch<unknown>(`/api/admin/leagues/${managingId.value}/members`, { method: 'POST', body: { userId: addUserId.value } }),
  onSuccess: () => {
    addUserId.value = null
    invalidateDetail()
  },
})
const roleMutation = useMutation({
  mutationFn: (input: { userId: string; role: LeagueRole }) =>
    $fetch<unknown>(`/api/admin/leagues/${managingId.value}/members/${input.userId}`, { method: 'PUT', body: { role: input.role } }),
  onSuccess: invalidateDetail,
})
const removeMutation = useMutation({
  mutationFn: (userId: string) =>
    $fetch<unknown>(`/api/admin/leagues/${managingId.value}/members/${userId}`, { method: 'DELETE' }),
  onSuccess: invalidateDetail,
})

const roleOptions = computed(() => [
  { label: t('leagues.roleOwner'), value: 'OWNER' },
  { label: t('leagues.roleModerator'), value: 'MODERATOR' },
  { label: t('leagues.roleMember'), value: 'MEMBER' },
])
</script>

<template>
  <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="grid md:grid-cols-3 gap-6 p-6">
      <div>
        <h2 class="font-semibold">{{ t('admin.leagues.title') }}</h2>
        <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.leagues.hint') }}</p>
      </div>
      <div class="md:col-span-2 flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">{{ t('admin.leagues.name') }}</label>
            <InputText v-model="createName" class="w-full" maxlength="50" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">{{ t('admin.leagues.competition') }}</label>
            <Select v-model="createSlug" :options="competitions ?? []" option-label="name" option-value="slug" class="w-full" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm">
            <ToggleSwitch v-model="createPublic" />
            {{ t('leagues.visibilityPublic') }}
          </label>
          <Button
            :label="t('admin.leagues.create')"
            size="small"
            :loading="createMutation.isPending.value"
            :disabled="createName.trim().length < 3 || !createSlug"
            @click="createMutation.mutate()"
          />
        </div>
        <Message v-if="createErr" severity="error" size="small">{{ createErr }}</Message>
      </div>
    </div>

    <div class="border-t px-6 py-4 flex flex-col gap-2" style="border-color: var(--p-content-border-color)">
      <div class="flex items-center gap-2 mb-1">
        <Select v-model="filterSlug" :options="filterOptions" option-label="label" option-value="value" size="small" class="w-56" />
        <span class="flex-1" />
        <span v-if="prunedCount !== null" class="text-xs" style="color: var(--p-text-muted-color)">
          {{ t('admin.leagues.prunedCount', { n: prunedCount }, prunedCount) }}
        </span>
        <Button
          :label="t('admin.leagues.prune')"
          severity="danger"
          outlined
          size="small"
          icon="pi pi-eraser"
          :loading="pruneMutation.isPending.value"
          @click="confirmPrune = true"
        />
      </div>
      <div v-if="isPending" class="text-sm opacity-60">{{ t('common.loading') }}</div>
      <div v-else-if="!leagues.length" class="text-sm opacity-60">{{ t('admin.leagues.empty') }}</div>
      <div v-for="l in leagues" v-else :key="l.id" class="flex items-center gap-3 text-sm flex-wrap">
        <Tag :value="l.visibility" :severity="l.visibility === 'PUBLIC' ? 'success' : 'secondary'" />
        <span class="font-medium">{{ l.name }}</span>
        <span class="text-xs" style="color: var(--p-text-muted-color)">{{ l.competition.name }}</span>
        <code class="text-xs font-mono">{{ l.joinCode }}</code>
        <span class="text-xs" style="color: var(--p-text-muted-color)">
          {{ t('leagues.memberCount', { n: l.memberCount }, l.memberCount) }}
          <template v-if="l.owner"> · {{ t('admin.leagues.owner') }}: {{ l.owner.name }}</template>
          <template v-if="l.autoJoinProviderIds.length"> · SSO: {{ l.autoJoinProviderIds.join(', ') }}</template>
        </span>
        <span class="flex-1" />
        <Button
          v-tooltip.left="t('leagues.visibilityLabel')"
          :icon="l.visibility === 'PUBLIC' ? 'pi pi-lock-open' : 'pi pi-lock'"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('leagues.visibilityLabel')"
          @click="visibilityMutation.mutate(l)"
        />
        <Button
          v-tooltip.left="t('admin.leagues.manageMembers')"
          icon="pi pi-users"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('admin.leagues.manageMembers')"
          @click="managing = l"
        />
        <Button
          v-tooltip.left="t('admin.leagues.delete')"
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          :aria-label="t('admin.leagues.delete')"
          @click="confirmDelete = l"
        />
      </div>
    </div>

    <Dialog
      :visible="!!managing"
      modal
      :draggable="false"
      :header="`${t('admin.leagues.manageMembers')} — ${managing?.name ?? ''}`"
      class="w-full max-w-lg mx-4"
      @update:visible="managing = null"
    >
      <div class="flex gap-2 mb-4">
        <Select
          v-model="addUserId"
          :options="addCandidates"
          option-label="label"
          option-value="value"
          filter
          class="flex-1"
          :placeholder="t('admin.leagues.addMember')"
        />
        <Button
          :label="t('admin.leagues.addMember')"
          size="small"
          :disabled="!addUserId"
          :loading="addMutation.isPending.value"
          @click="addMutation.mutate()"
        />
      </div>
      <ul class="flex flex-col divide-y" style="border-color: var(--p-content-border-color)">
        <li v-for="m in detail?.members ?? []" :key="m.userId" class="flex items-center gap-3 py-2">
          <Avatar :image="m.image || '/brand/avatar.svg'" shape="circle" class="shrink-0 overflow-hidden" />
          <span class="flex-1 min-w-0 truncate text-sm font-medium">{{ m.name }}</span>
          <Select
            :model-value="m.role"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-40"
            @update:model-value="(role: LeagueRole) => roleMutation.mutate({ userId: m.userId, role })"
          />
          <Button
            v-tooltip.left="t('admin.leagues.removeMember')"
            icon="pi pi-user-minus"
            severity="danger"
            text
            rounded
            size="small"
            :aria-label="t('admin.leagues.removeMember')"
            @click="removeMutation.mutate(m.userId)"
          />
        </li>
      </ul>
    </Dialog>

    <AppConfirmDialog
      :visible="!!confirmDelete"
      :header="t('admin.leagues.delete')"
      :message="t('admin.leagues.deleteConfirm')"
      severity="danger"
      @update:visible="confirmDelete = null"
      @confirm="deleteMutation.mutate(confirmDelete!.id); confirmDelete = null"
    />
    <AppConfirmDialog
      v-model:visible="confirmPrune"
      :header="t('admin.leagues.prune')"
      :message="t('admin.leagues.pruneConfirm')"
      severity="danger"
      @confirm="pruneMutation.mutate()"
    />
  </section>
</template>
