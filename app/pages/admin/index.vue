<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { searchable } from '../../utils/format'

const { t, locale } = useI18n()
useHead({ title: t('admin.title') })

const { data: status } = await useFetch<{ isAdmin: boolean }>('/api/admin/status')
const isAdmin = computed(() => status.value?.isAdmin === true)

const { data: settings, refresh: refreshSettings } = await useFetch<{ emailVerificationRequired: boolean; smtpConfigured: boolean }>(
  '/api/admin/settings',
  { default: () => ({ emailVerificationRequired: false, smtpConfigured: false }) },
)
const emailVerifBusy = ref(false)
const emailVerifErr = ref('')
async function toggleEmailVerification(enabled: boolean) {
  emailVerifBusy.value = true
  emailVerifErr.value = ''
  try {
    await $fetch('/api/admin/settings/email-verification', { method: 'POST', body: { enabled } })
    await refreshSettings()
  } catch (e: any) {
    emailVerifErr.value = e?.data?.statusMessage || 'Failed to update'
  } finally {
    emailVerifBusy.value = false
  }
}

interface SsoProviderRow {
  providerId: string
  domains: string[]
  issuer: string
  name: string | null
  type: 'oidc' | 'saml'
  autoJoinLeagueIds: string[]
  status: 'draft' | 'enabled' | 'disabled'
  domainVerified: boolean
  lastTestedAt: string | null
  lastTestOk: boolean | null
  scimEnabled: boolean
}
interface ConnectionCheck { name: string; ok: boolean; detail?: string }
const { data: ssoData, refresh: refreshSso } = await useFetch<{ providers: SsoProviderRow[] }>(
  '/api/admin/sso',
  { default: () => ({ providers: [] }) },
)
const providers = computed(() => ssoData.value?.providers ?? [])

const blank = { type: 'google', providerId: '', name: '', domains: '', issuer: '', clientId: '', clientSecret: '', entryPoint: '', cert: '', entityId: '', audience: '', idpMetadata: '', scopes: '' }
const form = reactive({ ...blank })
// Kept out of `blank`: Object.assign would share one array between resets.
const formAutoJoinLeagueIds = ref<string[]>([])
const typeOptions = [
  { label: 'Google', value: 'google' },
  { label: 'OIDC', value: 'oidc' },
  { label: 'SAML', value: 'saml' },
]
const ssoErr = ref('')
const ssoMsg = ref('')
const ssoLoading = ref(false)
// providerId of the provider being edited, or null when the form registers a new one.
const ssoEditing = ref<string | null>(null)

// Everything the IdP side needs, computed live from the form's provider id.
const origin = useRequestURL().origin
const setupId = computed(() => form.providerId.trim() || (form.type === 'google' ? 'google' : '<provider-id>'))
const oidcRedirectUri = computed(() => `${origin}/api/auth/sso/callback/${setupId.value}`)
const samlAcsUrl = computed(() => `${origin}/api/auth/sso/saml2/callback/${setupId.value}`)
const samlSpEntityId = computed(() => form.entityId.trim() || origin)
// Registered providers: the plugin's public endpoint (IdPs can poll it).
const spMetadataUrl = (id: string) => `${origin}/api/auth/sso/saml2/sp/metadata?providerId=${encodeURIComponent(id)}`
// Unsaved form: generated from the form values, so the IdP side can be
// configured before the provider exists here.
const draftSpMetadataUrl = computed(
  () => `${origin}/api/admin/sso/sp-metadata?providerId=${encodeURIComponent(form.providerId.trim())}&entityId=${encodeURIComponent(form.entityId.trim())}`,
)
const formSpMetadataUrl = computed(() => (ssoEditing.value ? spMetadataUrl(form.providerId) : draftSpMetadataUrl.value))
// Dedicated redirect for the dry-run test sign-in - the admin registers it at the
// IdP alongside the live one so a test never collides with a real session.
const testCallbackUri = `${origin}/api/sso/test-callback`

function startEditProvider(p: SsoProviderRow) {
  ssoErr.value = ''
  ssoMsg.value = ''
  Object.assign(form, blank, {
    type: p.type === 'saml' ? 'saml' : 'oidc',
    providerId: p.providerId,
    name: p.name ?? '',
    domains: p.domains.join(', '),
    issuer: p.issuer,
  })
  formAutoJoinLeagueIds.value = [...p.autoJoinLeagueIds]
  ssoEditing.value = p.providerId
}
function cancelEditProvider() {
  ssoEditing.value = null
  Object.assign(form, blank)
  formAutoJoinLeagueIds.value = []
}

async function saveProvider() {
  ssoErr.value = ''
  ssoMsg.value = ''
  ssoLoading.value = true
  // Google needs no provider id choice - default it so only domain + credentials remain.
  if (form.type === 'google' && !form.providerId) form.providerId = 'google'
  try {
    const providerId = ssoEditing.value || form.providerId
    if (ssoEditing.value) {
      await $fetch<unknown>(`/api/admin/sso/${ssoEditing.value}`, { method: 'PUT', body: { ...form } })
      ssoMsg.value = t('admin.sso.updated')
    } else {
      await $fetch<unknown>('/api/admin/sso', { method: 'POST', body: { ...form } })
      ssoMsg.value = t('admin.sso.added')
    }
    // League links live outside the provider's encrypted config.
    await $fetch<unknown>(`/api/admin/sso/${providerId}/leagues`, {
      method: 'PUT',
      body: { leagueIds: formAutoJoinLeagueIds.value },
    })
    ssoEditing.value = null
    Object.assign(form, blank)
    formAutoJoinLeagueIds.value = []
    await refreshSso()
  } catch (e: any) {
    ssoErr.value = e?.data?.statusMessage || e?.data?.message || 'Failed to save provider'
  } finally {
    ssoLoading.value = false
  }
}
async function removeProvider(id: string) {
  if (ssoEditing.value === id) cancelEditProvider()
  await $fetch<unknown>(`/api/admin/sso/${id}`, { method: 'DELETE' })
  await refreshSso()
}

// Per-provider onboarding panel (test -> verify -> enable, plus SCIM). Only one
// provider is expanded at a time; its transient state is reset on open.
const manageId = ref<string | null>(null)
const mgmtBusy = ref('')
const mgmtErr = ref('')
const testResult = ref<{ ok: boolean; checks: ConnectionCheck[] } | null>(null)
const domainInfo = ref<{ host: string; value: string; verified: boolean } | null>(null)
const domainCheck = ref<{ ok: boolean; found: string[] } | null>(null)
const scimToken = ref<string | null>(null)
const scimBaseUrl = ref<string | null>(null)
const claimPreview = ref<{ rawClaims: Record<string, unknown>; mapped: Record<string, string | null> } | null>(null)
const pendingTest = ref<{ testId: string; providerId: string } | null>(null)

function statusSeverity(s: SsoProviderRow['status']): string {
  return s === 'enabled' ? 'success' : s === 'disabled' ? 'warn' : 'secondary'
}

async function openManage(p: SsoProviderRow) {
  if (manageId.value === p.providerId) {
    manageId.value = null
    return
  }
  manageId.value = p.providerId
  mgmtErr.value = ''
  testResult.value = null
  domainCheck.value = null
  domainInfo.value = null
  scimToken.value = null
  claimPreview.value = null
  if (!p.domainVerified) await loadDomainInfo(p.providerId)
}

async function mgmt<T>(key: string, run: () => Promise<T>): Promise<T | undefined> {
  mgmtBusy.value = key
  mgmtErr.value = ''
  try {
    return await run()
  } catch (e: any) {
    mgmtErr.value = e?.data?.statusMessage || e?.data?.message || 'Action failed'
  } finally {
    mgmtBusy.value = ''
  }
}

async function runTest(id: string) {
  testResult.value = (await mgmt('test', () => $fetch<{ ok: boolean; checks: ConnectionCheck[] }>(`/api/admin/sso/${id}/test-connection`, { method: 'POST' }))) ?? null
  await refreshSso()
}
async function setStatus(id: string, status: SsoProviderRow['status']) {
  await mgmt('status', () => $fetch<unknown>(`/api/admin/sso/${id}/status`, { method: 'PUT', body: { status } }))
  await refreshSso()
}
async function loadDomainInfo(id: string) {
  domainInfo.value = (await mgmt('domain', () => $fetch<{ host: string; value: string; verified: boolean }>(`/api/admin/sso/${id}/verify-domain`))) ?? null
}
async function checkDomain(id: string) {
  domainCheck.value = (await mgmt('domaincheck', () => $fetch<{ ok: boolean; found: string[] }>(`/api/admin/sso/${id}/verify-domain`, { method: 'POST' }))) ?? null
  if (domainCheck.value?.ok) {
    await Promise.all([refreshSso(), loadDomainInfo(id)])
  }
}
async function bypassDomain(id: string) {
  await mgmt('bypass', () => $fetch<unknown>(`/api/admin/sso/${id}/bypass-domain`, { method: 'POST' }))
  await Promise.all([refreshSso(), loadDomainInfo(id)])
}
async function runTestSignIn(id: string) {
  claimPreview.value = null
  const r = await mgmt('signin', () => $fetch<{ testId: string; url: string }>(`/api/admin/sso/${id}/test-signin`, { method: 'POST' }))
  if (!r) return
  pendingTest.value = { testId: r.testId, providerId: id }
  window.open(r.url, 'sso-test-signin', 'width=520,height=680')
}
async function generateScim(id: string) {
  const r = await mgmt('scim', () => $fetch<{ scimToken: string; baseUrl: string }>(`/api/admin/sso/${id}/scim-token`, { method: 'POST' }))
  if (!r) return
  scimToken.value = r.scimToken
  scimBaseUrl.value = r.baseUrl
  await refreshSso()
}
async function revokeScim(id: string) {
  await mgmt('scimrevoke', () => $fetch<unknown>(`/api/admin/sso/${id}/scim-token`, { method: 'DELETE' }))
  scimToken.value = null
  await refreshSso()
}

// The test sign-in popup posts its result back; pull the captured claims through
// the admin-gated result route (claims never ride the popup message).
function onTestSignInMessage(ev: MessageEvent) {
  if (ev.origin !== origin) return
  const data = ev.data as { type?: string; testId?: string }
  if (data?.type !== 'sso-test-result' || !pendingTest.value || data.testId !== pendingTest.value.testId) return
  const { providerId, testId } = pendingTest.value
  pendingTest.value = null
  $fetch<{ result: typeof claimPreview.value }>(`/api/admin/sso/${providerId}/test-signin-result`, { query: { testId } })
    .then((r) => {
      claimPreview.value = r.result
    })
    .catch(() => {})
}
onMounted(() => window.addEventListener('message', onTestSignInMessage))
onUnmounted(() => window.removeEventListener('message', onTestSignInMessage))

// Back-fill provider league auto-join for all existing domain-matched users.
const ssoSyncBusy = ref(false)
const ssoSyncMsg = ref('')
async function syncSsoAutoJoin() {
  ssoSyncBusy.value = true
  ssoSyncMsg.value = ''
  try {
    const r = await $fetch<{ usersMatched: number; joined: number }>('/api/admin/leagues/sync-sso', { method: 'POST' })
    ssoSyncMsg.value = t('admin.sso.syncAutoJoinDone', { joined: r.joined, users: r.usersMatched })
  } finally {
    ssoSyncBusy.value = false
  }
}

// Users list lives in the query cache like every other server dataset:
// mutations invalidate, the list re-derives.
const { admin, session } = useAuth()
const myId = computed(() => session.value?.data?.user?.id)
const queryClient = useQueryClient()
const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

// Every league, for the SSO auto-join MultiSelect.
const { data: allLeaguesData, isPending: leaguesLoading } = useQuery({
  queryKey: ['admin-leagues', 'options'],
  enabled: isAdmin,
  queryFn: ({ signal }) =>
    $fetch<{ leagues: Array<{ id: string; name: string; competition: { name: string } }> }>('/api/admin/leagues', {
      signal,
    }).then((r) => r.leagues),
})
const leagueOptions = computed(() =>
  (allLeaguesData.value ?? []).map((l) => ({ label: `${l.name} — ${l.competition.name}`, value: l.id })),
)
const leagueTotal = computed(() => allLeaguesData.value?.length ?? 0)

const { data: usersData, isPending: usersLoading } = useQuery({
  queryKey: ['admin-users'],
  enabled: isAdmin,
  queryFn: async () => {
    const res = await admin.listUsers({ query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' } })
    const data = res.data as { users?: any[]; total?: number } | null
    return { users: data?.users ?? [], total: data?.total ?? data?.users?.length ?? 0 }
  },
})
const users = computed(() => usersData.value?.users ?? [])
const userTotal = computed(() => usersData.value?.total ?? 0)

// Client-side filter over the already-loaded users: display name fuzzy
// (case/diacritic-insensitive substring) OR email exact. The field is immediate;
// the debounced value drives the filter.
const userSearchRaw = ref('')
const userSearch = refDebounced(userSearchRaw, 200)
const filteredUsers = computed(() => {
  const q = userSearch.value.trim()
  if (!q) return users.value
  const fuzzy = searchable(q)
  const exact = q.toLowerCase()
  return users.value.filter((u: any) => searchable(u.name).includes(fuzzy) || (u.email ?? '').toLowerCase() === exact)
})
function joinedAt(d: string | Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// better-auth's listUsers has no account info; the SSO indicator and the
// unlink action need to know who is actually linked. Key shares the
// 'admin-users' prefix so invalidateUsers refreshes both.
const { data: ssoLinksData } = useQuery({
  queryKey: ['admin-users', 'sso-links'],
  enabled: isAdmin,
  queryFn: ({ signal }) =>
    $fetch<{ links: Record<string, string[]> }>('/api/admin/users/sso-links', { signal }).then((r) => r.links),
})
const ssoLinks = computed(() => ssoLinksData.value ?? {})

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

const visibilityMutation = useMutation({
  mutationFn: (u: any) =>
    $fetch<unknown>(`/api/admin/users/${u.id}/visibility`, { method: 'POST', body: { hidden: !u.hiddenFromLeaderboard } }),
  onSuccess: invalidateUsers,
})
const toggleVisibility = (u: any) => visibilityMutation.mutate(u)

const unlinkSsoMutation = useMutation({
  mutationFn: (u: any) => $fetch<unknown>(`/api/admin/users/${u.id}/unlink-sso`, { method: 'POST' }),
  onSuccess: invalidateUsers,
})
const unlinkSso = (u: any) => unlinkSsoMutation.mutate(u)

const verifyEmailMutation = useMutation({
  mutationFn: (u: any) => $fetch<unknown>(`/api/admin/users/${u.id}/verify-email`, { method: 'POST' }),
  onSuccess: invalidateUsers,
})
const verifyEmail = (u: any) => verifyEmailMutation.mutate(u)

// Per-user actions live in one popup menu - the inline button row stopped
// scaling with the number of actions.
const rowMenu = ref()
const menuUser = ref<any>(null)
const rowMenuItems = computed(() => {
  const u = menuUser.value
  if (!u) return []
  return [
    // Self-demotion is hidden: dropping your own admin role mid-session breaks
    // every admin query on this page (another admin can always demote you).
    ...(u.id !== myId.value
      ? [
          {
            label: u.role === 'admin' ? t('admin.users.demote') : t('admin.users.promote'),
            icon: u.role === 'admin' ? 'pi pi-angle-double-down' : 'pi pi-angle-double-up',
            command: () => toggleAdmin(u),
          },
        ]
      : []),
    {
      label: u.hiddenFromLeaderboard ? t('admin.users.show') : t('admin.users.hide'),
      icon: u.hiddenFromLeaderboard ? 'pi pi-eye' : 'pi pi-eye-slash',
      command: () => toggleVisibility(u),
    },
    ...(u.twoFactorEnabled ? [{ label: t('admin.users.remove2fa'), icon: 'pi pi-shield', command: () => strip2fa(u) }] : []),
    ...(u.emailVerified ? [] : [{ label: t('admin.users.verifyEmail'), icon: 'pi pi-envelope', command: () => verifyEmail(u) }]),
    ...(ssoLinks.value[u.id]?.length ? [{ label: t('admin.users.unlinkSso'), icon: 'pi pi-link', command: () => unlinkSso(u) }] : []),
    ...(u.id !== myId.value
      ? [
          { separator: true },
          {
            label: u.banned ? t('admin.users.unban') : t('admin.users.ban'),
            icon: u.banned ? 'pi pi-lock-open' : 'pi pi-ban',
            command: () => toggleBan(u),
          },
          { label: t('admin.users.delete'), icon: 'pi pi-trash', command: () => removeUser(u) },
        ]
      : []),
  ]
})
function openRowMenu(e: Event, u: any) {
  menuUser.value = u
  rowMenu.value?.toggle(e)
}

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

// Left-rail navigation. The active section lives in the URL (?section=) so
// /admin/cron can redirect here and bookmarks/links deep-link a section.
const route = useRoute()
const router = useRouter()
const navItems = [
  { key: 'signup', icon: 'pi pi-user-plus', label: 'admin.signup.title', hint: 'admin.signup.hint' },
  { key: 'sso', icon: 'pi pi-shield', label: 'admin.sso.title', hint: 'admin.sso.hint' },
  { key: 'users', icon: 'pi pi-users', label: 'admin.users.title', hint: 'admin.users.hint' },
  { key: 'competitions', icon: 'pi pi-flag', label: 'admin.competitions.title', hint: 'admin.competitions.hint' },
  { key: 'leagues', icon: 'pi pi-trophy', label: 'admin.leagues.title', hint: 'admin.leagues.hint' },
  { key: 'roadmap', icon: 'pi pi-map', label: 'admin.roadmap.title', hint: 'admin.roadmap.hint' },
  { key: 'cron', icon: 'pi pi-clock', label: 'cron.title', hint: 'cron.hint' },
  { key: 'scoring', icon: 'pi pi-calculator', label: 'admin.scoring.title', hint: 'admin.scoring.hint' },
  { key: 'odds', icon: 'pi pi-chart-line', label: 'admin.odds.title', hint: 'admin.odds.hint' },
  { key: 'api-keys', icon: 'pi pi-key', label: 'admin.apiKeys.title', hint: 'admin.apiKeys.hint' },
] as const
const navKeys = new Set<string>(navItems.map((i) => i.key))
const active = computed<string>({
  get: () => {
    const s = route.query.section
    return typeof s === 'string' && navKeys.has(s) ? s : 'signup'
  },
  set: (v) => router.replace({ query: { ...route.query, section: v } }),
})
const nav = computed(() => navItems.map((i) => ({ ...i, label: t(i.label), hint: t(i.hint) })))
const activeItem = computed(() => nav.value.find((i) => i.key === active.value) ?? nav.value[0])

// Rail badges: total count next to the categories that have one.
const counts = computed<Record<string, { total: number; loading: boolean }>>(() => ({
  users: { total: userTotal.value, loading: usersLoading.value },
  leagues: { total: leagueTotal.value, loading: leaguesLoading.value },
}))
</script>

<template>
  <div class="max-w-6xl mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('admin.title') }}</h1>

    <div v-if="!isAdmin" class="ng-card rounded-2xl border p-6 opacity-70" style="background: var(--p-content-background)">
      {{ t('admin.forbidden') }}
    </div>

    <div v-else class="flex flex-col md:flex-row gap-6 items-start">
      <!-- Category rail (desktop) / dropdown (mobile) -->
      <nav class="w-full md:w-56 md:shrink-0 md:sticky md:top-6">
        <Select v-model="active" :options="nav" option-label="label" option-value="key" class="w-full md:hidden" />
        <ul class="hidden md:flex flex-col gap-1">
          <li v-for="item in nav" :key="item.key">
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-start transition-colors"
              :class="active === item.key ? 'font-semibold' : 'opacity-80 hover:opacity-100'"
              :style="active === item.key
                ? 'background: var(--p-highlight-background); color: var(--p-highlight-color)'
                : 'color: var(--p-text-color)'"
              @click="active = item.key"
            >
              <i :class="item.icon" class="text-base" />
              <span class="flex-1 truncate">{{ item.label }}</span>
              <Tag v-if="counts[item.key] && !counts[item.key].loading" :value="String(counts[item.key].total)" severity="secondary" rounded />
            </button>
          </li>
        </ul>
      </nav>

      <!-- Active section -->
      <div class="flex-1 min-w-0 flex flex-col gap-4">
        <header>
          <h2 class="text-xl font-semibold flex items-center gap-2"><i :class="activeItem.icon" /> {{ activeItem.label }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ activeItem.hint }}</p>
        </header>

        <!-- Sign-up settings -->
        <section v-show="active === 'signup'" class="ng-card rounded-2xl border p-6" style="background: var(--p-content-background)">
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <ToggleSwitch
                :model-value="settings.emailVerificationRequired"
                :disabled="emailVerifBusy || (!settings.smtpConfigured && !settings.emailVerificationRequired)"
                @update:model-value="toggleEmailVerification"
              />
              <span class="text-sm font-medium">{{ t('admin.signup.requireEmailVerification') }}</span>
            </div>
            <Message v-if="!settings.smtpConfigured" severity="warn" size="small">{{ t('admin.signup.smtpRequired') }}</Message>
            <Message v-else-if="emailVerifErr" severity="error" size="small">{{ emailVerifErr }}</Message>
            <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.signup.grandfatherNote') }}</p>
          </div>
        </section>

        <!-- SSO -->
        <section v-show="active === 'sso'" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
          <div class="p-6 flex flex-col gap-4">
            <Message v-if="ssoEditing" severity="info" size="small">{{ t('admin.sso.editing', { id: ssoEditing }) }}</Message>
            <SelectButton v-if="!ssoEditing" v-model="form.type" :options="typeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.providerId') }}</label>
                <InputText v-model="form.providerId" placeholder="acme-okta" class="w-full" :disabled="!!ssoEditing" />
                <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.providerIdHint') }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.displayName') }}</label>
                <InputText v-model="form.name" placeholder="Acme Corp" class="w-full" />
                <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.displayNameHint') }}</span>
              </div>
              <div class="flex flex-col gap-1 col-span-2">
                <label class="text-xs font-medium">{{ t('admin.sso.domains') }}</label>
                <InputText v-model="form.domains" placeholder="acme.com, acme.fr" class="w-full" />
                <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.domainsHint') }}</span>
              </div>
              <div class="flex flex-col gap-1 col-span-2">
                <label class="text-xs font-medium">{{ t('admin.sso.autoJoinLeagues') }}</label>
                <MultiSelect
                  v-model="formAutoJoinLeagueIds"
                  :options="leagueOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  filter
                  class="w-full"
                  :placeholder="t('admin.sso.autoJoinLeagues')"
                />
                <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.autoJoinLeaguesHint') }}</span>
              </div>
            </div>

            <template v-if="form.type !== 'saml'">
              <div v-if="form.type === 'oidc'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.issuer') }}</label>
                <InputText v-model="form.issuer" placeholder="https://idp.acme.com" class="w-full" />
                <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.issuerHint') }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.clientId') }}</label>
                <InputText v-model="form.clientId" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.clientSecret') }}</label>
                <Password v-model="form.clientSecret" :feedback="false" toggle-mask fluid />
                <span v-if="ssoEditing" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.secretKeep') }}</span>
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
                <span v-if="ssoEditing" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.secretKeep') }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('admin.sso.idpMetadata') }}</label>
                <Textarea v-model="form.idpMetadata" rows="3" class="w-full font-mono text-xs" :placeholder="t('admin.sso.optionalXml')" />
              </div>
            </template>

            <!-- What the IdP side needs, live as the form is filled -->
            <div class="rounded-lg border p-3 text-xs flex flex-col gap-1" style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)">
              <div class="font-medium" style="color: var(--p-text-color)">{{ t('admin.sso.setupTitle') }}</div>
              <template v-if="form.type !== 'saml'">
                <div>{{ t('admin.sso.redirectUri') }}: <code class="select-all">{{ oidcRedirectUri }}</code></div>
                <div>{{ t('admin.sso.testRedirectUri') }}: <code class="select-all">{{ testCallbackUri }}</code></div>
                <div>{{ t('admin.sso.scopes') }}: <code>openid email profile</code></div>
                <div>{{ t('admin.sso.claims') }}: <code>sub, email</code> · {{ t('admin.sso.claimsOptional') }}: <code>name, picture, email_verified</code></div>
              </template>
              <template v-else>
                <div>{{ t('admin.sso.acsUrl') }}: <code class="select-all">{{ samlAcsUrl }}</code></div>
                <div>{{ t('admin.sso.spEntityId') }}: <code class="select-all">{{ samlSpEntityId }}</code></div>
                <div>{{ t('admin.sso.claims') }}: <code>nameID, email</code> · {{ t('admin.sso.claimsOptional') }}: <code>givenName, surname, displayName</code></div>
                <div v-if="form.providerId">
                  {{ t('admin.sso.spMetadata') }}:
                  <a :href="formSpMetadataUrl" target="_blank" rel="noopener" class="underline">{{ formSpMetadataUrl }}</a>
                </div>
              </template>
            </div>

            <Message v-if="ssoErr" severity="error" size="small">{{ ssoErr }}</Message>
            <Message v-if="ssoMsg" severity="success" size="small">{{ ssoMsg }}</Message>
          </div>
          <div class="border-t px-6 py-3 flex justify-end gap-2" style="border-color: var(--p-content-border-color)">
            <Button v-if="ssoEditing" :label="t('common.cancel')" severity="secondary" outlined @click="cancelEditProvider" />
            <Button
              :label="ssoEditing ? t('admin.sso.save') : t('admin.sso.add')"
              :loading="ssoLoading"
              :disabled="(!form.providerId && form.type !== 'google') || !form.domains"
              @click="saveProvider"
            />
          </div>

          <div v-if="providers.length" class="border-t px-6 py-4 flex flex-col gap-3" style="border-color: var(--p-content-border-color)">
            <div v-for="p in providers" :key="p.providerId" class="flex flex-col gap-2 rounded-lg border p-3" style="border-color: var(--p-content-border-color)">
              <div class="flex items-center gap-2 text-sm flex-wrap">
                <Tag :value="p.type.toUpperCase()" :severity="p.type === 'saml' ? 'warn' : 'info'" />
                <Tag :value="t(`admin.sso.status.${p.status}`)" :severity="statusSeverity(p.status)" />
                <Tag
                  :value="p.domainVerified ? t('admin.sso.domainVerifiedTag') : t('admin.sso.domainUnverifiedTag')"
                  :severity="p.domainVerified ? 'success' : 'warn'"
                  :icon="p.domainVerified ? 'pi pi-check' : 'pi pi-exclamation-triangle'"
                />
                <Tag v-if="p.scimEnabled" value="SCIM" severity="info" icon="pi pi-sync" />
                <span class="font-medium">{{ p.name || p.providerId }}</span>
                <span v-if="p.name" class="text-xs" style="color: var(--p-text-muted-color)">{{ p.providerId }}</span>
                <span class="truncate" style="color: var(--p-text-muted-color)">{{ p.domains.join(', ') }}</span>
                <span class="flex-1" />
                <Button
                  icon="pi pi-cog"
                  :label="t('admin.sso.manage')"
                  size="small"
                  severity="secondary"
                  :outlined="manageId !== p.providerId"
                  @click="openManage(p)"
                />
                <a
                  v-if="p.type === 'saml'"
                  v-tooltip.left="t('admin.sso.spMetadata')"
                  :href="spMetadataUrl(p.providerId)"
                  target="_blank"
                  rel="noopener"
                  class="p-button p-button-text p-button-rounded p-button-sm"
                  :aria-label="t('admin.sso.spMetadata')"
                ><i class="pi pi-download text-sm" /></a>
                <Button icon="pi pi-pencil" severity="secondary" text rounded size="small" :aria-label="t('admin.sso.edit')" @click="startEditProvider(p)" />
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" :aria-label="t('common.cancel')" @click="removeProvider(p.providerId)" />
              </div>

              <div v-if="manageId === p.providerId" class="flex flex-col gap-4 pt-2 border-t text-sm" style="border-color: var(--p-content-border-color)">
                <Message v-if="mgmtErr" severity="error" size="small">{{ mgmtErr }}</Message>

                <div class="flex flex-col gap-2">
                  <div class="text-xs font-medium uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ t('admin.sso.lifecycle') }}</div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <Button :label="t('admin.sso.testConnection')" icon="pi pi-bolt" size="small" :loading="mgmtBusy === 'test'" @click="runTest(p.providerId)" />
                    <Button v-if="p.type === 'oidc'" :label="t('admin.sso.testSignIn')" icon="pi pi-id-card" size="small" severity="help" :loading="mgmtBusy === 'signin'" @click="runTestSignIn(p.providerId)" />
                    <Button v-if="p.status !== 'enabled'" :label="t('admin.sso.enable')" icon="pi pi-check" size="small" severity="success" :disabled="!p.lastTestOk || !p.domainVerified" :loading="mgmtBusy === 'status'" @click="setStatus(p.providerId, 'enabled')" />
                    <Button v-else :label="t('admin.sso.disable')" icon="pi pi-pause" size="small" severity="warn" :loading="mgmtBusy === 'status'" @click="setStatus(p.providerId, 'disabled')" />
                    <Button v-if="p.status === 'disabled'" :label="t('admin.sso.toDraft')" size="small" text :loading="mgmtBusy === 'status'" @click="setStatus(p.providerId, 'draft')" />
                    <span v-if="p.status !== 'enabled' && (!p.lastTestOk || !p.domainVerified)" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.enableHint') }}</span>
                  </div>
                  <div v-if="testResult" class="rounded-lg border p-2 flex flex-col gap-1 text-xs" style="border-color: var(--p-content-border-color)">
                    <div v-for="c in testResult.checks" :key="c.name" class="flex items-start gap-2">
                      <i :class="c.ok ? 'pi pi-check-circle' : 'pi pi-times-circle'" :style="{ color: c.ok ? 'var(--ng-success)' : 'var(--p-red-500)' }" />
                      <span class="font-medium">{{ c.name }}</span>
                      <span style="color: var(--p-text-muted-color)">{{ c.detail }}</span>
                    </div>
                  </div>
                  <div v-if="claimPreview" class="rounded-lg border p-2 flex flex-col gap-1 text-xs" style="border-color: var(--p-content-border-color)">
                    <div class="font-medium">{{ t('admin.sso.claimPreviewTitle') }}</div>
                    <div v-for="(v, k) in claimPreview.mapped" :key="k"><code>{{ k }}</code> → {{ v ?? '—' }}</div>
                    <details class="mt-1">
                      <summary class="cursor-pointer" style="color: var(--p-text-muted-color)">{{ t('admin.sso.rawClaims') }}</summary>
                      <pre class="whitespace-pre-wrap break-all mt-1">{{ JSON.stringify(claimPreview.rawClaims, null, 2) }}</pre>
                    </details>
                  </div>
                </div>

                <div v-if="!p.domainVerified" class="flex flex-col gap-2">
                  <div class="text-xs font-medium uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ t('admin.sso.domainVerification') }}</div>
                  <div v-if="domainInfo" class="text-xs flex flex-col gap-1">
                    <div>{{ t('admin.sso.txtRecordHint', { domain: p.domains[0] }) }}</div>
                    <div>{{ t('admin.sso.txtHost') }}: <code class="select-all break-all">{{ domainInfo.host }}</code></div>
                    <div>{{ t('admin.sso.txtValue') }}: <code class="select-all break-all">{{ domainInfo.value }}</code></div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <Button :label="t('admin.sso.checkDns')" icon="pi pi-search" size="small" :loading="mgmtBusy === 'domaincheck'" @click="checkDomain(p.providerId)" />
                    <Button :label="t('admin.sso.bypass')" icon="pi pi-shield" size="small" severity="secondary" outlined :loading="mgmtBusy === 'bypass'" @click="bypassDomain(p.providerId)" />
                    <span v-if="domainCheck && !domainCheck.ok" class="text-xs" style="color: var(--p-red-500)">{{ t('admin.sso.dnsNotFound') }}</span>
                  </div>
                </div>

                <div class="flex flex-col gap-2">
                  <div class="text-xs font-medium uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ t('admin.sso.scim') }}</div>
                  <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.scimHint') }}</div>
                  <div v-if="scimToken" class="rounded-lg border p-2 flex flex-col gap-1 text-xs" style="border-color: var(--p-content-border-color)">
                    <div>{{ t('admin.sso.scimBaseUrl') }}: <code class="select-all break-all">{{ scimBaseUrl }}</code></div>
                    <div>{{ t('admin.sso.scimToken') }}: <code class="select-all break-all">{{ scimToken }}</code></div>
                    <div style="color: var(--p-orange-500)">{{ t('admin.sso.scimTokenOnce') }}</div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <Button :label="p.scimEnabled ? t('admin.sso.scimRotate') : t('admin.sso.scimGenerate')" icon="pi pi-key" size="small" :loading="mgmtBusy === 'scim'" @click="generateScim(p.providerId)" />
                    <Button v-if="p.scimEnabled" :label="t('admin.sso.scimRevoke')" icon="pi pi-ban" size="small" severity="danger" outlined :loading="mgmtBusy === 'scimrevoke'" @click="revokeScim(p.providerId)" />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="providers.length" class="flex items-center gap-3 flex-wrap pt-2 border-t" style="border-color: var(--p-content-border-color)">
              <Button
                :label="t('admin.sso.syncAutoJoin')"
                icon="pi pi-users"
                size="small"
                severity="help"
                :loading="ssoSyncBusy"
                @click="syncSsoAutoJoin"
              />
              <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.sso.syncAutoJoinHint') }}</span>
              <span v-if="ssoSyncMsg" class="text-xs font-semibold" style="color: var(--ng-success)">{{ ssoSyncMsg }}</span>
            </div>
          </div>
        </section>

        <!-- Users -->
        <section v-show="active === 'users'" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
          <div class="p-6 flex flex-col gap-3">
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
          <div class="border-t" style="border-color: var(--p-content-border-color)">
            <div class="px-6 py-3">
              <InputText v-model="userSearchRaw" :placeholder="t('admin.users.search')" class="w-full" size="small" />
            </div>
            <div v-if="usersLoading" class="px-6 py-4 opacity-60">{{ t('common.loading') }}</div>
            <div v-for="u in filteredUsers" :key="u.id" class="flex items-center gap-3 px-6 py-3 border-t text-sm" style="border-color: var(--p-content-border-color)">
              <UserAvatar :image="u.image" :user-id="u.id" />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ u.name }}</div>
                <div class="text-xs truncate" style="color: var(--p-text-muted-color)">{{ u.email }}</div>
              </div>
              <i
                v-if="u.hiddenFromLeaderboard"
                v-tooltip.left="t('admin.users.hide')"
                class="pi pi-eye-slash text-xs"
                style="color: var(--p-text-muted-color)"
              />
              <i v-if="u.twoFactorEnabled" v-tooltip.left="'2FA'" class="pi pi-shield text-xs" style="color: var(--p-text-muted-color)" />
              <i
                v-if="ssoLinks[u.id]?.length"
                v-tooltip.left="`SSO: ${ssoLinks[u.id].join(', ')}`"
                class="pi pi-link text-xs"
                style="color: var(--p-text-muted-color)"
              />
              <Tag v-if="u.banned" value="BANNED" severity="danger" />
              <Tag v-if="u.role === 'admin'" value="ADMIN" severity="success" />
              <span class="text-xs shrink-0 tabular-nums" style="color: var(--p-text-muted-color)">{{ joinedAt(u.createdAt) }}</span>
              <Button
                icon="pi pi-ellipsis-v"
                size="small"
                severity="secondary"
                text
                rounded
                :aria-label="t('admin.users.actions')"
                @click="openRowMenu($event, u)"
              />
            </div>
            <div v-if="!usersLoading && !filteredUsers.length" class="px-6 py-4 text-sm text-center" style="color: var(--p-text-muted-color)">{{ t('admin.users.noResults') }}</div>
          </div>
          <Menu ref="rowMenu" :model="rowMenuItems" popup />
        </section>

        <!-- Competitions: featured team for the Team Specialist prize -->
        <AdminCompetitionsSection v-show="active === 'competitions'" :is-admin="isAdmin" />

        <!-- Leagues -->
        <AdminLeaguesSection v-show="active === 'leagues'" :is-admin="isAdmin" />

        <!-- Roadmap -->
        <AdminRoadmapSection v-show="active === 'roadmap'" :is-admin="isAdmin" />

        <!-- Scheduled tasks -->
        <AdminCronSection v-show="active === 'cron'" :is-admin="isAdmin" />

        <!-- Scoring config -->
        <AdminScoringSection v-show="active === 'scoring'" :is-admin="isAdmin" />

        <!-- Odds provider per competition -->
        <AdminOddsSection v-show="active === 'odds'" :is-admin="isAdmin" />

        <!-- API clients (machine keys) -->
        <AdminApiKeysSection v-show="active === 'api-keys'" :is-admin="isAdmin" />
      </div>
    </div>
  </div>
</template>
