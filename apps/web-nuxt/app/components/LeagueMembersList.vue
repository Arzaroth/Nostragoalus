<script setup lang="ts">
import type { LeagueMember, LeagueRole } from '../composables/useLeagues'

const props = defineProps<{
  leagueId: string
  myRole: LeagueRole | null
  members: LeagueMember[]
  hiddenCount?: number
}>()

const { t } = useI18n()
const { session } = useAuth()
const { setRole, kick, transferOwnership } = useLeagueActions()
const meId = computed(() => session.value?.data?.user?.id)

const confirmKick = ref<LeagueMember | null>(null)
const confirmTransfer = ref<LeagueMember | null>(null)

function roleLabel(role: LeagueRole) {
  return role === 'OWNER' ? t('leagues.roleOwner') : role === 'MODERATOR' ? t('leagues.roleModerator') : t('leagues.roleMember')
}

function canKickRow(m: LeagueMember) {
  if (m.userId === meId.value) return false
  if (props.myRole === 'OWNER') return m.role !== 'OWNER'
  if (props.myRole === 'MODERATOR') return m.role === 'MEMBER'
  return false
}
</script>

<template>
  <ul class="flex flex-col divide-y" style="border-color: var(--p-content-border-color)">
    <li v-for="m in props.members" :key="m.userId" class="flex items-center gap-3 py-2">
      <UserAvatar :image="m.image" :user-id="m.userId" />
      <span class="flex-1 min-w-0 truncate text-sm font-medium">{{ m.name }}</span>
      <Tag :value="roleLabel(m.role)" :severity="m.role === 'OWNER' ? 'warn' : m.role === 'MODERATOR' ? 'info' : 'secondary'" />
      <template v-if="props.myRole === 'OWNER' && m.userId !== meId">
        <Button
          v-if="m.role === 'MEMBER'"
          v-tooltip.top="t('leagues.promote')"
          icon="pi pi-angle-double-up"
          text
          size="small"
          :aria-label="t('leagues.promote')"
          @click="setRole.mutate({ leagueId: props.leagueId, userId: m.userId, role: 'MODERATOR' })"
        />
        <Button
          v-if="m.role === 'MODERATOR'"
          v-tooltip.top="t('leagues.demote')"
          icon="pi pi-angle-double-down"
          text
          size="small"
          :aria-label="t('leagues.demote')"
          @click="setRole.mutate({ leagueId: props.leagueId, userId: m.userId, role: 'MEMBER' })"
        />
        <Button
          v-if="m.role !== 'OWNER'"
          v-tooltip.top="t('leagues.transfer')"
          icon="pi pi-crown"
          text
          size="small"
          :aria-label="t('leagues.transfer')"
          @click="confirmTransfer = m"
        />
      </template>
      <Button
        v-if="canKickRow(m)"
        v-tooltip.top="t('leagues.kick')"
        icon="pi pi-user-minus"
        text
        size="small"
        severity="danger"
        :aria-label="t('leagues.kick')"
        @click="confirmKick = m"
      />
    </li>
    <li
      v-if="props.hiddenCount"
      v-tooltip.top="{ value: t('leaderboard.hiddenTip'), pt: { text: 'text-xs max-w-64' } }"
      class="flex items-center gap-1.5 py-2 text-xs cursor-help"
      style="color: var(--p-text-muted-color)"
    >
      <i class="pi pi-eye-slash" style="font-size: 0.7rem" />
      {{ t('leaderboard.hidden', { n: props.hiddenCount }, props.hiddenCount) }}
      <i class="pi pi-info-circle" style="font-size: 0.7rem; opacity: 0.6" />
    </li>
  </ul>

  <AppConfirmDialog
    :visible="!!confirmKick"
    :header="t('leagues.kick')"
    :message="t('leagues.kickConfirm', { name: confirmKick?.name ?? '' })"
    severity="danger"
    @update:visible="confirmKick = null"
    @confirm="kick.mutate({ leagueId: props.leagueId, userId: confirmKick!.userId }); confirmKick = null"
  />
  <AppConfirmDialog
    :visible="!!confirmTransfer"
    :header="t('leagues.transfer')"
    :message="t('leagues.transferConfirm', { name: confirmTransfer?.name ?? '' })"
    @update:visible="confirmTransfer = null"
    @confirm="transferOwnership.mutate({ leagueId: props.leagueId, userId: confirmTransfer!.userId }); confirmTransfer = null"
  />
</template>
