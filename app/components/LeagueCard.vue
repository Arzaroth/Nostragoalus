<script setup lang="ts">
import type { League } from '../composables/useLeagues'

const props = defineProps<{ league: League }>()

const { t } = useI18n()
const { update, regenerateCode, leave, remove } = useLeagueActions()
const detailId = ref<string | null>(null)
const detail = useLeagueDetail(detailId)
const { copy } = useClipboard()

const expanded = ref(false)
const renaming = ref(false)
const newName = ref('')
const copied = ref(false)
const confirmRegen = ref(false)
const confirmLeave = ref(false)
const confirmDelete = ref(false)
const showInvites = ref(false)

const canManage = computed(() => props.league.role === 'OWNER' || props.league.role === 'MODERATOR')
const isOwner = computed(() => props.league.role === 'OWNER')

function toggleMembers() {
  expanded.value = !expanded.value
  detailId.value = expanded.value ? props.league.id : null
}

async function copyCode() {
  if (!props.league.joinCode) return
  await copy(props.league.joinCode)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function saveRename() {
  if (newName.value.trim().length < 3) return
  await update.mutateAsync({ leagueId: props.league.id, name: newName.value.trim() })
  renaming.value = false
}

function toggleVisibility() {
  update.mutate({
    leagueId: props.league.id,
    visibility: props.league.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC',
  })
}
</script>

<template>
  <div class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
    <div class="flex items-center gap-3 flex-wrap">
      <i class="pi pi-users" style="color: var(--p-primary-color)" />
      <template v-if="renaming">
        <InputText v-model="newName" size="small" maxlength="50" class="w-48" @keyup.enter="saveRename" />
        <Button icon="pi pi-check" text size="small" :aria-label="t('common.save')" :loading="update.isPending.value" @click="saveRename" />
        <Button icon="pi pi-times" text size="small" :aria-label="t('common.cancel')" @click="renaming = false" />
      </template>
      <template v-else>
        <NuxtLink :to="`/leagues/${props.league.id}`" class="font-semibold hover:underline truncate">{{ props.league.name }}</NuxtLink>
        <Button
          v-if="canManage"
          v-tooltip.top="t('leagues.rename')"
          icon="pi pi-pencil"
          text
          size="small"
          :aria-label="t('leagues.rename')"
          @click="renaming = true; newName = props.league.name"
        />
      </template>
      <Tag
        :value="props.league.role === 'OWNER' ? t('leagues.roleOwner') : props.league.role === 'MODERATOR' ? t('leagues.roleModerator') : t('leagues.roleMember')"
        :severity="props.league.role === 'OWNER' ? 'warn' : props.league.role === 'MODERATOR' ? 'info' : 'secondary'"
      />
      <Tag v-if="props.league.visibility === 'PUBLIC'" :value="t('leagues.public')" severity="success" />
      <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('leagues.memberCount', { n: props.league.memberCount }, props.league.memberCount) }}</span>
      <span class="flex-1" />
      <template v-if="isOwner">
        <Button
          v-tooltip.top="t('leagues.visibilityLabel')"
          :icon="props.league.visibility === 'PUBLIC' ? 'pi pi-lock-open' : 'pi pi-lock'"
          text
          size="small"
          :aria-label="t('leagues.visibilityLabel')"
          @click="toggleVisibility"
        />
      </template>
      <Button
        v-if="isOwner"
        v-tooltip.top="t('leagues.delete')"
        icon="pi pi-trash"
        text
        size="small"
        severity="danger"
        :aria-label="t('leagues.delete')"
        @click="confirmDelete = true"
      />
      <Button
        v-else
        v-tooltip.top="t('leagues.leave')"
        icon="pi pi-sign-out"
        text
        size="small"
        severity="danger"
        :aria-label="t('leagues.leave')"
        @click="confirmLeave = true"
      />
    </div>

    <div v-if="props.league.joinCode" class="flex items-center gap-2 mt-2 text-sm">
      <span style="color: var(--p-text-muted-color)">{{ t('leagues.codeLabel') }}:</span>
      <code class="font-mono font-semibold tracking-wider">{{ props.league.joinCode }}</code>
      <Button
        v-tooltip.top="copied ? t('leagues.codeCopied') : t('leagues.copyCode')"
        :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
        text
        size="small"
        :aria-label="t('leagues.copyCode')"
        @click="copyCode"
      />
      <Button
        v-tooltip.top="t('leagues.regenerate')"
        icon="pi pi-refresh"
        text
        size="small"
        :aria-label="t('leagues.regenerate')"
        :loading="regenerateCode.isPending.value"
        @click="confirmRegen = true"
      />
      <Button
        v-tooltip.top="t('invites.title')"
        icon="pi pi-link"
        text
        size="small"
        :aria-label="t('invites.title')"
        @click="showInvites = true"
      />
    </div>

    <div class="mt-2 flex items-center gap-4">
      <button type="button" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)" @click="toggleMembers">
        <i :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-xs" />
        {{ t('leagues.members') }}
      </button>
      <NuxtLink :to="`/leagues/${props.league.id}`" class="text-sm inline-flex items-center gap-1 hover:underline" style="color: var(--p-primary-color)">
        <i class="pi pi-trophy text-xs" />
        {{ t('leagues.viewRankings') }}
      </NuxtLink>
    </div>
    <div v-if="expanded" class="mt-1">
      <div v-if="detail.isLoading.value" class="text-sm opacity-60">{{ t('common.loading') }}</div>
      <LeagueMembersList
        v-else-if="detail.data.value"
        :league-id="props.league.id"
        :my-role="props.league.role"
        :members="detail.data.value.members"
        :hidden-count="detail.data.value.league.memberCount - detail.data.value.members.length"
      />
    </div>

    <LeagueInviteDialog v-if="canManage" v-model:visible="showInvites" :league-id="props.league.id" :join-code="props.league.joinCode" />
    <AppConfirmDialog v-model:visible="confirmRegen" :header="t('leagues.regenerate')" :message="t('leagues.regenerateConfirm')" @confirm="regenerateCode.mutate(props.league.id)" />
    <AppConfirmDialog v-model:visible="confirmLeave" :header="t('leagues.leave')" :message="t('leagues.leaveConfirm')" severity="danger" @confirm="leave.mutate(props.league.id)" />
    <AppConfirmDialog v-model:visible="confirmDelete" :header="t('leagues.delete')" :message="t('leagues.deleteConfirm')" severity="danger" @confirm="remove.mutate(props.league.id)" />
  </div>
</template>
