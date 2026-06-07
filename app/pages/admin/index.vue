<script setup lang="ts">
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
  try {
    await $fetch('/api/admin/sso', { method: 'POST', body: { ...form } })
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
  await $fetch(`/api/admin/sso/${id}`, { method: 'DELETE' })
  await refreshSso()
}

const syncMsg = ref('')
const syncBusy = ref('')
async function runImport() {
  syncBusy.value = 'import'
  try {
    syncMsg.value = JSON.stringify(await $fetch('/api/admin/import-fixtures', { method: 'POST' }))
  } finally {
    syncBusy.value = ''
  }
}
async function runTask(task: string) {
  syncBusy.value = task
  try {
    syncMsg.value = JSON.stringify(await $fetch('/api/admin/sync', { method: 'POST', body: { task } }))
  } finally {
    syncBusy.value = ''
  }
}

const { admin } = useAuth()
const users = ref<any[]>([])
const usersLoading = ref(false)
async function loadUsers() {
  usersLoading.value = true
  try {
    const res = await admin.listUsers({ query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' } })
    users.value = (res.data as { users?: any[] } | null)?.users ?? []
  } catch {
    users.value = []
  } finally {
    usersLoading.value = false
  }
}
onMounted(loadUsers)

async function toggleAdmin(u: any) {
  await admin.setRole({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
  await loadUsers()
}
async function removeUser(u: any) {
  await admin.removeUser({ userId: u.id })
  await loadUsers()
}

const nu = reactive({ name: '', email: '', password: '', role: 'user' })
const createErr = ref('')
const creating = ref(false)
const roleOptions = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' },
]
async function createUser() {
  createErr.value = ''
  creating.value = true
  const { error } = await admin.createUser({ name: nu.name, email: nu.email, password: nu.password, role: nu.role as 'user' | 'admin' })
  creating.value = false
  if (error) {
    createErr.value = error.message || 'Failed to create user'
    return
  }
  Object.assign(nu, { name: '', email: '', password: '', role: 'user' })
  await loadUsers()
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
            <Tag v-if="u.role === 'admin'" value="ADMIN" severity="success" />
            <Button
              :label="u.role === 'admin' ? t('admin.users.demote') : t('admin.users.promote')"
              size="small"
              severity="secondary"
              outlined
              @click="toggleAdmin(u)"
            />
            <Button icon="pi pi-trash" size="small" severity="danger" text rounded :aria-label="t('admin.users.delete')" @click="removeUser(u)" />
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
            <div class="flex flex-wrap gap-2">
              <Button :label="t('admin.data.import')" icon="pi pi-download" size="small" severity="secondary" :loading="syncBusy === 'import'" @click="runImport" />
              <Button label="Refresh fixtures" icon="pi pi-refresh" size="small" severity="secondary" :loading="syncBusy === 'fixtures'" @click="runTask('fixtures')" />
              <Button label="Poll scores" icon="pi pi-bolt" size="small" severity="secondary" :loading="syncBusy === 'live'" @click="runTask('live')" />
              <Button label="Finalize" icon="pi pi-flag" size="small" severity="secondary" :loading="syncBusy === 'finalize'" @click="runTask('finalize')" />
            </div>
            <pre v-if="syncMsg" class="text-xs p-2 rounded overflow-x-auto" style="background: color-mix(in srgb, var(--p-text-color) 6%, transparent)">{{ syncMsg }}</pre>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
