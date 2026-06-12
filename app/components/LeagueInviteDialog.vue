<script setup lang="ts">
import type { LeagueInvite } from '../composables/useLeagueInvites'

const props = defineProps<{ leagueId: string }>()
const visible = defineModel<boolean>('visible', { required: true })

const { t, locale } = useI18n()
const enabled = computed(() => visible.value)
const leagueIdRef = computed(() => props.leagueId)
const { query, create, revoke } = useLeagueInvites(leagueIdRef, enabled)
const { copy } = useClipboard()
const origin = import.meta.client ? window.location.origin : ''

// Mint form presets - kept coarse so the UI is two selects, not a date picker.
const expiryOptions = computed(() => [
  { label: t('invites.expiry.never'), value: null },
  { label: t('invites.expiry.h24'), value: 24 },
  { label: t('invites.expiry.d7'), value: 168 },
  { label: t('invites.expiry.d30'), value: 720 },
])
const usesOptions = computed(() => [
  { label: t('invites.uses.unlimited'), value: null },
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '25', value: 25 },
])
const expiresInHours = ref<number | null>(168)
const maxUses = ref<number | null>(null)

const inviteUrl = (token: string) => `${origin}/leagues/join/${token}`
const copiedId = ref<string | null>(null)
async function copyLink(invite: LeagueInvite) {
  await copy(inviteUrl(invite.token))
  copiedId.value = invite.id
  setTimeout(() => (copiedId.value = null), 1500)
}

function fmtExpiry(invite: LeagueInvite) {
  if (!invite.expiresAt) return t('invites.expiry.never')
  return new Date(invite.expiresAt).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtUses(invite: LeagueInvite) {
  return invite.maxUses === null ? `${invite.uses}` : `${invite.uses} / ${invite.maxUses}`
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('invites.title')" :style="{ width: '32rem' }">
    <div class="flex flex-col gap-4">
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('invites.hint') }}</p>

      <div class="flex items-end gap-2 flex-wrap">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">{{ t('invites.expiryLabel') }}</label>
          <Select v-model="expiresInHours" :options="expiryOptions" option-label="label" option-value="value" size="small" class="w-36" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">{{ t('invites.usesLabel') }}</label>
          <Select v-model="maxUses" :options="usesOptions" option-label="label" option-value="value" size="small" class="w-32" />
        </div>
        <Button
          :label="t('invites.create')"
          icon="pi pi-plus"
          size="small"
          :loading="create.isPending.value"
          @click="create.mutate({ expiresInHours, maxUses })"
        />
      </div>

      <div v-if="query.isLoading.value" class="opacity-60 text-sm">{{ t('common.loading') }}</div>
      <div v-else-if="!query.data.value?.length" class="opacity-60 text-sm">{{ t('invites.empty') }}</div>
      <div v-else class="flex flex-col divide-y" style="border-color: var(--p-content-border-color)">
        <div
          v-for="invite in query.data.value"
          :key="invite.id"
          class="flex items-center gap-2 py-2 text-sm"
          style="border-color: var(--p-content-border-color)"
        >
          <div class="flex-1 min-w-0">
            <code class="font-mono text-xs truncate block">/leagues/join/{{ invite.token }}</code>
            <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">
              {{ t('invites.expiresOn', { date: fmtExpiry(invite) }) }} · {{ t('invites.usesLabel') }}: {{ fmtUses(invite) }}
            </div>
          </div>
          <Button
            v-tooltip.top="copiedId === invite.id ? t('leagues.codeCopied') : t('invites.copyLink')"
            :icon="copiedId === invite.id ? 'pi pi-check' : 'pi pi-copy'"
            text
            size="small"
            :aria-label="t('invites.copyLink')"
            @click="copyLink(invite)"
          />
          <Button
            v-tooltip.top="t('invites.revoke')"
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            :aria-label="t('invites.revoke')"
            :loading="revoke.isPending.value"
            @click="revoke.mutate(invite.id)"
          />
        </div>
      </div>
    </div>
  </Dialog>
</template>
