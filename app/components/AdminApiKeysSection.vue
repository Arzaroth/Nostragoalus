<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { authClient } from '../../lib/auth-client'

const props = defineProps<{ isAdmin: boolean }>()
const { t } = useI18n()
const queryClient = useQueryClient()
const enabled = computed(() => props.isAdmin)

interface KeyRow {
  id: string
  name: string | null
  start: string | null
  enabled: boolean
  expiresAt: string | null
  lastRequest: string | null
  permissions: Record<string, string[]> | null
  createdAt: string
}

const { data: keys, isPending } = useQuery({
  queryKey: ['admin-api-keys'],
  enabled,
  queryFn: async () => {
    const { data, error } = await authClient.apiKey.list()
    if (error) throw new Error(error.message || 'Failed to load API keys')
    // list() returns a paginated envelope { apiKeys, total, limit, offset }.
    return ((data?.apiKeys ?? []) as unknown) as KeyRow[]
  },
})
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] })

// The scopes an admin can grant. Today only the watch-link curation bot needs
// one; new machine integrations add their permission here.
const SCOPES = [{ resource: 'media', action: 'write', labelKey: 'scopeMediaWrite' }] as const
const EXPIRY = [
  { key: 'never', seconds: null },
  { key: 'd30', seconds: 60 * 60 * 24 * 30 },
  { key: 'd90', seconds: 60 * 60 * 24 * 90 },
  { key: 'y1', seconds: 60 * 60 * 24 * 365 },
] as const

const form = reactive({
  name: '',
  scopes: { 'media:write': true } as Record<string, boolean>,
  expiry: 'never' as (typeof EXPIRY)[number]['key'],
})
const createErr = ref('')
// The plaintext key, shown exactly once right after creation (it is stored
// hashed and can never be retrieved again).
const createdKey = ref<string | null>(null)

function selectedPermissions(): Record<string, string[]> {
  const perms: Record<string, string[]> = {}
  for (const s of SCOPES) {
    if (form.scopes[`${s.resource}:${s.action}`]) (perms[s.resource] ??= []).push(s.action)
  }
  return perms
}
const canCreate = computed(() => form.name.trim().length > 0 && Object.keys(selectedPermissions()).length > 0)

const createMutation = useMutation({
  mutationFn: async () => {
    const expiresIn = EXPIRY.find((e) => e.key === form.expiry)?.seconds ?? null
    const { data, error } = await authClient.apiKey.create({
      name: form.name.trim(),
      permissions: selectedPermissions(),
      expiresIn,
      // Machine cadence is governed by the integration, not a per-key quota.
      rateLimitEnabled: false,
    })
    if (error) throw new Error(error.message || 'Failed to create API key')
    return data as { key: string }
  },
  onSuccess: (data) => {
    createdKey.value = data.key
    form.name = ''
    createErr.value = ''
    invalidate()
  },
  onError: (e: any) => {
    createErr.value = e?.message || t('admin.apiKeys.createFailed')
  },
})

const revokeMutation = useMutation({
  mutationFn: async (keyId: string) => {
    const { error } = await authClient.apiKey.delete({ keyId })
    if (error) throw new Error(error.message || 'Failed to revoke API key')
  },
  onSuccess: invalidate,
})

function scopeText(perms: Record<string, string[]> | null): string {
  if (!perms) return '-'
  return (
    Object.entries(perms)
      .flatMap(([r, acts]) => acts.map((a) => `${r}:${a}`))
      .join(', ') || '-'
  )
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : t('admin.apiKeys.never')
}

const copied = ref(false)
async function copyKey() {
  if (createdKey.value && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(createdKey.value)
    copied.value = true
  }
}
function dismissCreatedKey() {
  createdKey.value = null
  copied.value = false
}
</script>

<template>
  <section v-if="isAdmin" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
    <div class="p-6 flex flex-col gap-4">
      <div>
        <h2 class="font-semibold">{{ t('admin.apiKeys.title') }}</h2>
        <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.apiKeys.hint') }}</p>
      </div>

      <!-- Shown once after minting: copy now or lose it. -->
      <Message v-if="createdKey" severity="success" :closable="false">
        <div class="flex flex-col gap-2">
          <span class="font-semibold">{{ t('admin.apiKeys.createdWarn') }}</span>
          <code class="px-2 py-1 rounded text-xs break-all" style="background: var(--p-content-border-color)">{{ createdKey }}</code>
          <div class="flex gap-2">
            <button type="button" class="px-2 py-1 rounded text-xs font-semibold" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)" @click="copyKey">
              {{ copied ? t('admin.apiKeys.copied') : t('admin.apiKeys.copy') }}
            </button>
            <button type="button" class="px-2 py-1 rounded text-xs" style="border: 1px solid var(--p-content-border-color)" @click="dismissCreatedKey">{{ t('admin.apiKeys.done') }}</button>
          </div>
        </div>
      </Message>

      <div v-if="isPending" class="text-sm" style="color: var(--p-text-muted-color)">…</div>
      <div v-else-if="!keys || !keys.length" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('admin.apiKeys.none') }}</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr style="color: var(--p-text-muted-color)" class="text-left">
            <th class="py-1">{{ t('admin.apiKeys.colName') }}</th>
            <th>{{ t('admin.apiKeys.colScopes') }}</th>
            <th>{{ t('admin.apiKeys.colKey') }}</th>
            <th>{{ t('admin.apiKeys.colExpires') }}</th>
            <th>{{ t('admin.apiKeys.colLastUsed') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id" class="border-t" style="border-color: var(--p-content-border-color)">
            <td class="py-2">{{ k.name || '-' }}</td>
            <td>{{ scopeText(k.permissions) }}</td>
            <td><code class="text-xs">{{ k.start ? `${k.start}…` : '-' }}</code></td>
            <td>{{ fmtDate(k.expiresAt) }}</td>
            <td>{{ fmtDate(k.lastRequest) }}</td>
            <td class="text-right">
              <button type="button" class="p-1 rounded hover:opacity-70" :aria-label="t('admin.apiKeys.revoke')" @click="revokeMutation.mutate(k.id)">
                <i class="pi pi-trash" style="color: var(--ng-danger)" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <form class="flex flex-col gap-2 border-t pt-4" style="border-color: var(--p-content-border-color)" @submit.prevent="createMutation.mutate()">
        <div class="text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('admin.apiKeys.addTitle') }}</div>
        <input v-model="form.name" type="text" :placeholder="t('admin.apiKeys.namePlaceholder')" :aria-label="t('admin.apiKeys.name')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
        <div class="flex flex-wrap gap-3 items-center">
          <label v-for="s in SCOPES" :key="`${s.resource}:${s.action}`" class="inline-flex items-center gap-1.5 text-sm">
            <input v-model="form.scopes[`${s.resource}:${s.action}`]" type="checkbox" >
            {{ t(`admin.apiKeys.${s.labelKey}`) }}
          </label>
          <select v-model="form.expiry" :aria-label="t('admin.apiKeys.expiry')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
            <option v-for="e in EXPIRY" :key="e.key" :value="e.key">{{ t(`admin.apiKeys.expiry_${e.key}`) }}</option>
          </select>
        </div>
        <span v-if="createErr" class="text-xs" style="color: var(--ng-danger)">{{ createErr }}</span>
        <button
          type="submit"
          :disabled="!canCreate || createMutation.isPending.value"
          class="self-start px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
        >
          {{ t('admin.apiKeys.create') }}
        </button>
      </form>
    </div>
  </section>
</template>
