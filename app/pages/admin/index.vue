<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

const { t } = useI18n()

const { data: status } = await useFetch<{ isAdmin: boolean }>('/api/admin/status')
const isAdmin = computed(() => status.value?.isAdmin === true)

const { data: ssoData, refresh: refreshSso } = await useFetch<{ providers: { providerId: string; domain: string; issuer: string; type: string }[] }>(
  '/api/admin/sso',
  { default: () => ({ providers: [] }) },
)
const providers = computed(() => ssoData.value?.providers ?? [])

const blank = { type: 'google', providerId: '', domain: '', issuer: '', clientId: '', clientSecret: '', entryPoint: '', cert: '', entityId: '', audience: '', idpMetadata: '', scopes: '' }
const form = reactive({ ...blank })
const typeOptions = [
  { label: 'Google', value: 'google' },
  { label: 'OIDC', value: 'oidc' },
  { label: 'SAML', value: 'saml' },
]
const ssoErr = ref('')
const ssoMsg = ref('')
const ssoLoading = ref(false)

async function addProvider() {
  ssoErr.value = ''
  ssoMsg.value = ''
  ssoLoading.value = true
  // Google needs no provider id choice - default it so only domain + credentials remain.
  if (form.type === 'google' && !form.providerId) form.providerId = 'google'
  try {
    await $fetch<unknown>('/api/admin/sso', { method: 'POST', body: { ...form } })
    ssoMsg.value = t('admin.sso.added')
    Object.assign(form, blank)
    await refreshSso()
  } catch (e: any) {
    ssoErr.value = e?.data?.statusMessage || e?.data?.message || 'Failed to register provider'
  } finally {
    ssoLoading.value = false
  }
}
async function removeProvider(id: string) {
  await $fetch<unknown>(`/api/admin/sso/${id}`, { method: 'DELETE' })
  await refreshSso()
}

const syncMsg = ref('')
const syncBusy = ref('')

// Last run / failure per task, shown in the action tooltips.
// blocking (not lazy): if this landed after hover, the reactive tooltip value
// change would re-create and hide an already-open tooltip
const { data: taskStatus, refresh: refreshTaskStatus } = await useFetch<{ tasks: any[] }>('/api/admin/task-status')
function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// Computed (cached object identity): the 1s next-run ticker re-renders this
// component; a fresh inline tooltip object each render makes PrimeVue re-create
// (and dismiss) an open tooltip every second.
const importTooltip = computed(() => ({ value: taskTip('import-fixtures', t('admin.data.importTip')), escape: false }))
const refreshTooltip = computed(() => ({ value: taskTip('fixtures:refresh', t('admin.data.refreshTip')), escape: false }))
const pollTooltip = computed(() => ({ value: taskTip('scores:poll', t('admin.data.pollTip')), escape: false }))
const finalizeTooltip = computed(() => ({ value: taskTip('matches:finalize', t('admin.data.finalizeTip')), escape: false }))

// Turn the stored JSON result into readable "key: value" lines.
function humanizeResult(json: string): string {
  try {
    const data = JSON.parse(json)
    const root = data && typeof data === 'object' && 'result' in data ? data.result : data
    if (root === null || typeof root !== 'object') return escapeHtml(String(root))
    const lines: string[] = []
    const walk = (v: unknown, path: string[]) => {
      if (v === null || v === undefined) return
      if (typeof v === 'object') {
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, [...path, k])
      } else if (!(typeof v === 'number' && v === 0)) {
        lines.push(`${escapeHtml(path.join(' · '))}: <b>${escapeHtml(String(v))}</b>`)
      }
    }
    walk(root, [])
    if (!lines.length) return escapeHtml(t('admin.data.nothingToDo'))
    return lines.slice(0, 8).join('<br>') + (lines.length > 8 ? '<br>…' : '')
  } catch {
    return escapeHtml(json)
  }
}
function taskTip(name: string, base: string) {
  const row = taskStatus.value?.tasks?.find((x) => x.taskName === name)
  let html = escapeHtml(base)
  if (row?.lastRunAt) {
    html += `<br><br><b>${escapeHtml(t('admin.data.lastRun'))}:</b> ${new Date(row.lastRunAt).toLocaleString()} · ${row.lastDurationMs}ms`
    if (row.lastResult) html += `<br><span style="opacity:.8">${humanizeResult(String(row.lastResult))}</span>`
  }
  if (row?.lastFailureAt) {
    html += `<br><br><b style="color:#fca5a5">${escapeHtml(t('admin.data.lastFailure'))}:</b> ${new Date(row.lastFailureAt).toLocaleString()}<br><span style="opacity:.75">${escapeHtml(String(row.lastError ?? '').slice(0, 160))}</span>`
  }
  return html
}

async function runImport() {
  syncBusy.value = 'import'
  try {
    syncMsg.value = JSON.stringify(await $fetch<unknown>('/api/admin/import-fixtures', { method: 'POST' }))
  } finally {
    syncBusy.value = ''
    void refreshTaskStatus()
  }
}
async function runTask(task: string) {
  syncBusy.value = task
  try {
    syncMsg.value = JSON.stringify(await $fetch<unknown>('/api/admin/sync', { method: 'POST', body: { task } }))
  } finally {
    syncBusy.value = ''
    void refreshTaskStatus()
  }
}

// Users list lives in the query cache like every other server dataset:
// mutations invalidate, the list re-derives.
const { admin, session } = useAuth()
const myId = computed(() => session.value?.data?.user?.id)
const queryClient = useQueryClient()
const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

const { data: usersData, isPending: usersLoading } = useQuery({
  queryKey: ['admin-users'],
  enabled: isAdmin,
  queryFn: async () => {
    const res = await admin.listUsers({ query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' } })
    return (res.data as { users?: any[] } | null)?.users ?? []
  },
})
const users = computed(() => usersData.value ?? [])

const roleMutation = useMutation({
  mutationFn: (u: any) => admin.setRole({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' }),
  onSuccess: invalidateUsers,
})
const toggleAdmin = (u: any) => roleMutation.mutate(u)

const banMutation = useMutation({
  mutationFn: (u: any) =>
    u.banned ? admin.unbanUser({ userId: u.id }) : admin.banUser({ userId: u.id, banReason: 'banned by admin' }),
  onSuccess: invalidateUsers,
})
const toggleBan = (u: any) => banMutation.mutate(u)

const strip2faMutation = useMutation({
  mutationFn: (u: any) => $fetch<unknown>(`/api/admin/users/${u.id}/remove-2fa`, { method: 'POST' }),
  onSuccess: invalidateUsers,
})
const strip2fa = (u: any) => strip2faMutation.mutate(u)

const deleteMutation = useMutation({
  mutationFn: (u: any) => admin.removeUser({ userId: u.id }),
  onSuccess: invalidateUsers,
})
const removeUser = (u: any) => deleteMutation.mutate(u)

const nu = reactive({ name: '', email: '', password: '', role: 'user' })
const createErr = ref('')
const roleOptions = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' },
]
const createMutation = useMutation({
  mutationFn: async () => {
    // better-auth returns errors as data, not throws - normalize for the mutation.
    const { error } = await admin.createUser({ name: nu.name, email: nu.email, password: nu.password, role: nu.role as 'user' | 'admin' })
    if (error) throw new Error(error.message || 'Failed to create user')
  },
  onSuccess: () => {
    Object.assign(nu, { name: '', email: '', password: '', role: 'user' })
    invalidateUsers()
  },
  onError: (e: Error) => {
    createErr.value = e.message
  },
})
const creating = createMutation.isPending
function createUser() {
  createErr.value = ''
  createMutation.mutate()
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('admin.title') }}</h1>

    <div v-if="!isAdmin" class="ng-card rounded-2xl border p-6 opacity-70" style="background: var(--p-content-background)">
      {{ t('admin.forbidden') }}
    </div>

    <template v-else>
      <!-- SSO -->
      <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
        <div class="grid md:grid-cols-3 gap-6 p-6">
          <div>
            <h2 class="font-semibold">{{ t('admin.sso.title') }}</h2>
            <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.sso.hint') }}</p>
          </div>
          <div class="md:col-span-2 flex flex-col gap-4">
            <SelectButton v-model="form.type" :options="typeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.providerId') }}</label>
                <InputText v-model="form.providerId" placeholder="acme-okta" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.domain') }}</label>
                <InputText v-model="form.domain" placeholder="acme.com" class="w-full" />
              </div>
            </div>

            <template v-if="form.type !== 'saml'">
              <div v-if="form.type === 'oidc'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.issuer') }}</label>
                <InputText v-model="form.issuer" placeholder="https://idp.acme.com" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.clientId') }}</label>
                <InputText v-model="form.clientId" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.clientSecret') }}</label>
                <Password v-model="form.clientSecret" :feedback="false" toggle-mask fluid />
              </div>
            </template>

            <template v-else>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.entryPoint') }}</label>
                <InputText v-model="form.entryPoint" placeholder="https://idp.acme.com/saml/sso" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.cert') }}</label>
                <Textarea v-model="form.cert" rows="4" class="w-full font-mono text-xs" placeholder="-----BEGIN CERTIFICATE-----" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.idpMetadata') }}</label>
                <Textarea v-model="form.idpMetadata" rows="3" class="w-full font-mono text-xs" :placeholder="t('admin.sso.optionalXml')" />
              </div>
            </template>

            <Message v-if="ssoErr" severity="error" size="small">{{ ssoErr }}</Message>
            <Message v-if="ssoMsg" severity="success" size="small">{{ ssoMsg }}</Message>
          </div>
        </div>
        <div class="border-t px-6 py-3 flex justify-end" style="border-color: var(--p-content-border-color)">
          <Button :label="t('admin.sso.add')" :loading="ssoLoading" :disabled="!form.providerId || !form.domain" @click="addProvider" />
        </div>

        <div v-if="providers.length" class="border-t px-6 py-4 flex flex-col gap-2" style="border-color: var(--p-content-border-color)">
          <div v-for="p in providers" :key="p.providerId" class="flex items-center gap-3 text-sm">
            <Tag :value="p.type.toUpperCase()" :severity="p.type === 'saml' ? 'warn' : 'info'" />
            <span class="font-medium">{{ p.providerId }}</span>
            <span style="color: var(--p-text-muted-color)">{{ p.domain }}</span>
            <span class="flex-1" />
            <Button icon="pi pi-trash" severity="danger" text rounded size="small" :aria-label="t('common.cancel')" @click="removeProvider(p.providerId)" />
          </div>
        </div>
      </section>

      <!-- Users -->
      <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
        <div class="grid md:grid-cols-3 gap-6 p-6">
          <div>
            <h2 class="font-semibold">{{ t('admin.users.title') }}</h2>
            <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.users.hint') }}</p>
          </div>
          <div class="md:col-span-2 flex flex-col gap-3">
            <div class="grid sm:grid-cols-2 gap-2">
              <InputText v-model="nu.name" :placeholder="t('account.displayName')" />
              <InputText v-model="nu.email" type="email" :placeholder="t('account.email')" />
              <Password v-model="nu.password" :feedback="false" toggle-mask fluid :placeholder="t('account.password')" />
              <div class="flex items-center gap-2">
                <SelectButton v-model="nu.role" :options="roleOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
                <Button :label="t('admin.users.create')" size="small" :loading="creating" :disabled="!nu.email || !nu.password" @click="createUser" />
              </div>
            </div>
            <Message v-if="createErr" severity="error" size="small">{{ createErr }}</Message>
          </div>
        </div>
        <div class="border-t" style="border-color: var(--p-content-border-color)">
          <div v-if="usersLoading" class="px-6 py-4 opacity-60">{{ t('common.loading') }}</div>
          <div v-for="u in users" :key="u.id" class="flex items-center gap-3 px-6 py-3 border-t text-sm" style="border-color: var(--p-content-border-color)">
            <Avatar :image="u.image || '/brand/avatar.svg'" shape="circle" class="shrink-0 overflow-hidden" />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ u.name }}</div>
              <div class="text-xs truncate" style="color: var(--p-text-muted-color)">{{ u.email }}</div>
            </div>
            <Button
              v-if="u.twoFactorEnabled"
              v-tooltip.left="t('admin.users.remove2fa')"
              icon="pi pi-shield"
              size="small"
              severity="warn"
              text
              rounded
              :aria-label="t('admin.users.remove2fa')"
              @click="strip2fa(u)"
            />
            <Tag v-if="u.banned" value="BANNED" severity="danger" />
            <Button
              v-if="u.id !== myId"
              v-tooltip.left="u.banned ? t('admin.users.unban') : t('admin.users.ban')"
              :icon="u.banned ? 'pi pi-lock-open' : 'pi pi-ban'"
              size="small"
              :severity="u.banned ? 'success' : 'danger'"
              text
              rounded
              :aria-label="u.banned ? t('admin.users.unban') : t('admin.users.ban')"
              @click="toggleBan(u)"
            />
            <Tag v-if="u.role === 'admin'" value="ADMIN" severity="success" />
            <Button
              :label="u.role === 'admin' ? t('admin.users.demote') : t('admin.users.promote')"
              size="small"
              severity="secondary"
              outlined
              @click="toggleAdmin(u)"
            />
            <Button v-if="u.id !== myId" icon="pi pi-trash" size="small" severity="danger" text rounded :aria-label="t('admin.users.delete')" @click="removeUser(u)" />
          </div>
        </div>
      </section>

      <!-- Data -->
      <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
        <div class="grid md:grid-cols-3 gap-6 p-6">
          <div>
            <h2 class="font-semibold">{{ t('admin.data.title') }}</h2>
            <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('admin.data.hint') }}</p>
          </div>
          <div class="md:col-span-2 flex flex-col gap-3">
            <!-- uniform buttons with centered labels; next-run column aligned -->
            <div class="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 justify-center">
              <Button v-tooltip.left="importTooltip" :label="t('admin.data.import')" icon="pi pi-download" size="small" severity="info" class="w-48" :loading="syncBusy === 'import'" @click="runImport" />
              <NextRunLabel :step="null" />
              <Button v-tooltip.left="refreshTooltip" :label="t('admin.data.refresh')" icon="pi pi-refresh" size="small" severity="help" class="w-48" :loading="syncBusy === 'fixtures'" @click="runTask('fixtures')" />
              <NextRunLabel step="hourly" />
              <Button v-tooltip.left="pollTooltip" :label="t('admin.data.poll')" icon="pi pi-bolt" size="small" severity="warn" class="w-48" :loading="syncBusy === 'live'" @click="runTask('live')" />
              <NextRunLabel :step="2" />
              <Button v-tooltip.left="finalizeTooltip" :label="t('admin.data.finalize')" icon="pi pi-flag" size="small" severity="success" class="w-48" :loading="syncBusy === 'finalize'" @click="runTask('finalize')" />
              <NextRunLabel :step="5" />
            </div>
            <pre v-if="syncMsg" class="text-xs p-2 rounded overflow-x-auto" style="background: color-mix(in srgb, var(--p-text-color) 6%, transparent)">{{ syncMsg }}</pre>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
