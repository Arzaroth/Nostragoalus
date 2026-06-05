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
              <Button label="Live scores" icon="pi pi-bolt" size="small" severity="secondary" :loading="syncBusy === 'live'" @click="runTask('live')" />
              <Button label="Finalize" icon="pi pi-flag" size="small" severity="secondary" :loading="syncBusy === 'finalize'" @click="runTask('finalize')" />
            </div>
            <pre v-if="syncMsg" class="text-xs p-2 rounded overflow-x-auto" style="background: color-mix(in srgb, var(--p-text-color) 6%, transparent)">{{ syncMsg }}</pre>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
