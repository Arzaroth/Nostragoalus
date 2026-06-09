<script setup lang="ts">
import { resizeToDataUrl } from '../utils/image'
import { authClient } from '../../lib/auth-client'

const { t } = useI18n()
const { session, changeEmail, changePassword, updateUser, deleteUser, signOut } = useAuth()
const router = useRouter()

const currentUser = computed(() => session.value?.data?.user)

// SSO-managed accounts (no credential account row) get their email, password,
// 2FA and passkeys from the IdP - local credential management is hidden and
// the server rejects it too.
const linkedAccounts = ref<{ provider?: string; providerId?: string }[] | null>(null)
onMounted(async () => {
  const res = await authClient.listAccounts()
  linkedAccounts.value = (res.data as { provider?: string; providerId?: string }[] | null) ?? []
})
const ssoManaged = computed(() => {
  const list = linkedAccounts.value
  if (!list || list.length === 0) return false
  return !list.some((a) => (a.provider ?? a.providerId) === 'credential')
})

// --- Two-factor authentication (state machine extracted to a tested composable) ---
const tfa = useTwoFactor(currentUser)
const tfaPassword = tfa.password
const tfaCode = tfa.code
const tfaUri = tfa.uri
const tfaQr = tfa.qr
const tfaBackup = tfa.backup
const tfaStep = tfa.step
const tfaErr = tfa.err
const tfaBusy = tfa.busy
const tfaDisableCode = tfa.disableCode
const tfaSecret = tfa.secret
const tfaEnabled = tfa.enabled
const regenCodes = tfa.regenCodes
const regenBusy = tfa.regenBusy
const startEnable2fa = tfa.startEnable
const confirmEnable2fa = tfa.confirmEnable
const cancelEnable2fa = tfa.cancelEnable
const confirmBackupSaved = tfa.confirmBackupSaved
const regenerateBackupCodes = tfa.regenerate
const disable2fa = () => tfa.disable(() => session.value?.refetch?.())

// Presentation-only helpers kept on the page (copy feedback, download, reveal).
const tfaSecretShown = ref(false)
const tfaCopied = ref('')
const { copy: copyToClipboard } = useClipboard()
async function copyText(text: string, which: string) {
  await copyToClipboard(text)
  tfaCopied.value = which
  setTimeout(() => (tfaCopied.value = ''), 1500)
}
function downloadBackupCodes(codes?: string[]) {
  const list = Array.isArray(codes) ? codes : tfaBackup.value
  const blob = new Blob([list.join('\n') + '\n'], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'nostragoalus-backup-codes.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

// --- Passkeys (extracted composable) ---
const pk = usePasskeys()
const passkeys = pk.list
const pkBusy = pk.busy
const pkErr = pk.err
const pkName = pk.name
const pkPassword = pk.password
const pkCode = pk.code
const addPasskey = pk.add
const removePasskey = pk.remove
onMounted(pk.load)

// --- Trusted-device cookie (HttpOnly; the server reports trust state) ---
const { data: trustStatus, refresh: refreshTrust } = await useFetch<{ trusted: boolean }>('/api/me/trust-status', { lazy: true })
const deviceTrusted = computed(() => trustStatus.value?.trusted === true)
async function revokeTrust() {
  await $fetch<{ trusted: boolean }>('/api/me/revoke-trust', { method: 'POST' })
  await refreshTrust()
}


const email = ref('')
const displayName = ref('')
watch(
  currentUser,
  (u) => {
    if (!u) return
    if (!email.value) email.value = u.email ?? ''
    if (!displayName.value) displayName.value = u.name ?? ''
  },
  { immediate: true },
)

const avatarUrl = ref('')
const avatarInput = ref<HTMLInputElement>()
const avatarErr = ref('')
watch(currentUser, (u) => { if (u && !avatarUrl.value) avatarUrl.value = u.image ?? '' }, { immediate: true })

async function onAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  avatarErr.value = ''
  try {
    const dataUrl = await resizeToDataUrl(file)
    const { error } = await updateUser({ image: dataUrl })
    if (error) throw new Error(error.message ?? 'Failed')
    avatarUrl.value = dataUrl
  } catch (err) {
    avatarErr.value = (err as Error).message
  }
}

const profileErr = ref('')
const profileMsg = ref('')
const profileLoading = ref(false)
async function saveProfile() {
  profileErr.value = ''
  profileMsg.value = ''
  profileLoading.value = true
  try {
    const u = currentUser.value
    if (displayName.value && displayName.value !== u?.name) {
      const { error } = await updateUser({ name: displayName.value })
      if (error) throw new Error(error.message ?? 'Failed')
    }
    if (!ssoManaged.value && email.value && email.value !== u?.email) {
      const { error } = await changeEmail({ newEmail: email.value })
      if (error) throw new Error(error.message ?? 'Failed')
    }
    profileMsg.value = t('account.saved')
  } catch (e) {
    profileErr.value = (e as Error).message
  } finally {
    profileLoading.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwErr = ref('')
const pwMsg = ref('')
const pwLoading = ref(false)
async function savePassword() {
  pwErr.value = ''
  pwMsg.value = ''
  if (newPassword.value !== confirmPassword.value) {
    pwErr.value = t('account.passwordMismatch')
    return
  }
  pwLoading.value = true
  const { error } = await changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value, revokeOtherSessions: true })
  pwLoading.value = false
  if (error) pwErr.value = error.message ?? 'Failed'
  else {
    pwMsg.value = t('account.passwordChanged')
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
}

const confirming = ref(false)
const deletePassword = ref('')
const deleteCode = ref('')
const delErr = ref('')
const delLoading = ref(false)
async function confirmDelete() {
  delErr.value = ''
  delLoading.value = true
  const { error } = await deleteUser({
    // SSO-managed accounts have no password; deletion rides on the fresh session.
    ...(ssoManaged.value ? {} : { password: deletePassword.value }),
    // 2FA holders must also present a fresh code (enforced server-side).
    fetchOptions: tfaEnabled.value ? { headers: { 'x-totp-code': String(deleteCode.value) } } : undefined,
  } as Parameters<typeof deleteUser>[0])
  delLoading.value = false
  if (error) {
    delErr.value = error.message ?? 'Failed'
    return
  }
  await signOut()
  await router.push('/login')
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('account.title') }}</h1>

    <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('account.profile') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('account.profileHint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <div class="relative shrink-0">
              <Avatar :image="avatarUrl || '/brand/avatar.svg'" size="xlarge" shape="circle" class="overflow-hidden" />
              <button
                type="button"
                class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md cursor-pointer"
                style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
                :aria-label="t('account.changeAvatar')"
                @click="avatarInput?.click()"
              >
                <i class="pi pi-pencil text-xs" />
              </button>
              <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarFile" >
            </div>
            <div class="text-sm" style="color: var(--p-text-muted-color)">{{ t('account.avatarHint') }}</div>
          </div>
          <Message v-if="avatarErr" severity="error" size="small">{{ avatarErr }}</Message>
          <Message v-if="ssoManaged" severity="info" size="small">{{ t('account.ssoManagedHint') }}</Message>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.email') }}</label>
            <IconField>
              <InputIcon class="pi pi-envelope" />
              <InputText v-model="email" type="email" class="w-full" :disabled="ssoManaged" />
            </IconField>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.displayName') }}</label>
            <IconField>
              <InputIcon class="pi pi-at" />
              <InputText v-model="displayName" class="w-full" />
            </IconField>
          </div>
          <Message v-if="profileErr" severity="error" size="small">{{ profileErr }}</Message>
          <Message v-if="profileMsg" severity="success" size="small">{{ profileMsg }}</Message>
        </div>
      </div>
      <div class="border-t px-6 py-3 flex justify-end" style="border-color: var(--p-content-border-color)">
        <Button :label="t('common.save')" :loading="profileLoading" @click="saveProfile" />
      </div>
    </section>

    <section v-if="!ssoManaged" class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('account.password') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('account.passwordHint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.currentPassword') }}</label>
            <Password v-model="currentPassword" :feedback="false" toggle-mask fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.newPassword') }}</label>
            <Password v-model="newPassword" :feedback="false" toggle-mask fluid />
            <PasswordStrength :password="newPassword" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.confirmPassword') }}</label>
            <Password v-model="confirmPassword" :feedback="false" toggle-mask fluid />
          </div>
          <Message v-if="pwErr" severity="error" size="small">{{ pwErr }}</Message>
          <Message v-if="pwMsg" severity="success" size="small">{{ pwMsg }}</Message>
        </div>
      </div>
      <div class="border-t px-6 py-3 flex justify-end" style="border-color: var(--p-content-border-color)">
        <Button :label="t('common.save')" :loading="pwLoading" :disabled="!currentPassword || !newPassword || !confirmPassword" @click="savePassword" />
      </div>
    </section>

    <section v-if="!ssoManaged" class="ng-card rounded-2xl border" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('twofa.sectionTitle') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('twofa.sectionHint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-3">
          <Message v-if="tfaErr" severity="error" size="small">{{ tfaErr }}</Message>

          <!-- enrollment step 2: save the backup codes before finishing -->
          <template v-if="tfaStep === 'backup'">
            <div class="font-medium text-sm">{{ t('twofa.backupTitle') }}</div>
            <div class="rounded-xl border p-3" style="border-color: var(--p-content-border-color)">
              <div class="text-xs mb-2" style="color: var(--p-text-muted-color)">{{ t('twofa.backupHintLong') }}</div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 font-mono text-xs mb-3">
                <span v-for="c in tfaBackup" :key="c">{{ c }}</span>
              </div>
              <div class="flex gap-2">
                <Button :icon="tfaCopied === 'codes' ? 'pi pi-check' : 'pi pi-copy'" :label="t('twofa.copyCodes')" size="small" severity="secondary" outlined @click="copyText(tfaBackup.join('\n'), 'codes')" />
                <Button icon="pi pi-download" :label="t('twofa.download')" size="small" severity="secondary" outlined @click="() => downloadBackupCodes()" />
              </div>
            </div>
            <div class="flex justify-end border-t pt-4" style="border-color: var(--p-content-border-color)">
              <Button :label="t('twofa.savedCodes')" icon="pi pi-check" @click="confirmBackupSaved" />
            </div>
          </template>

          <template v-else-if="tfaEnabled">
            <div class="flex items-center gap-2 text-sm font-medium"><i class="pi pi-shield" style="color: var(--ng-success)" /> {{ t('twofa.enabled') }}</div>

            <div v-if="deviceTrusted" class="flex items-center gap-3 text-sm">
              <Button :label="t('twofa.trustRevoke')" icon="pi pi-eraser" size="small" severity="secondary" outlined @click="revokeTrust" />
            </div>

            <!-- one password gate shared by the actions below -->
            <div class="flex flex-col gap-1 max-w-xs">
              <label class="text-xs font-medium">{{ t('account.currentPassword') }}</label>
              <Password v-model="tfaPassword" :feedback="false" toggle-mask fluid />
            </div>

            <div class="rounded-xl border p-3 flex flex-col gap-3" style="border-color: var(--p-content-border-color)">
              <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('twofa.regenHint') }}</div>
              <div v-if="regenCodes.length">
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 font-mono text-xs mb-3">
                  <span v-for="c in regenCodes" :key="c">{{ c }}</span>
                </div>
                <div class="flex gap-2">
                  <Button :icon="tfaCopied === 'regen' ? 'pi pi-check' : 'pi pi-copy'" :label="t('twofa.copyCodes')" size="small" severity="secondary" outlined @click="copyText(regenCodes.join('\n'), 'regen')" />
                  <Button icon="pi pi-download" :label="t('twofa.download')" size="small" severity="secondary" outlined @click="downloadBackupCodes(regenCodes)" />
                </div>
              </div>
              <div v-else>
                <Button :label="t('twofa.regen')" size="small" severity="secondary" outlined :loading="regenBusy" :disabled="!tfaPassword" @click="regenerateBackupCodes" />
              </div>
            </div>

            <div class="flex flex-wrap items-end gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('twofa.disableCode') }}</label>
                <InputOtp v-model="tfaDisableCode" :length="6" integer-only @keyup.enter="tfaPassword && tfaDisableCode && disable2fa()" />
              </div>
              <Button :label="t('twofa.disable')" severity="danger" outlined :loading="tfaBusy" :disabled="!tfaPassword || String(tfaDisableCode).length < 6" @click="disable2fa" />
            </div>
          </template>

          <template v-else-if="tfaStep === 'verify'">
            <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('twofa.scan') }}</p>
            <div class="flex flex-col sm:flex-row gap-6 items-start">
              <img :src="tfaQr" alt="TOTP QR" class="w-44 h-44 rounded-lg bg-white p-2 shrink-0" >
              <div class="flex flex-col gap-2 min-w-0">
                <label class="text-xs font-medium">{{ t('twofa.secret') }}</label>
                <div class="flex items-center gap-1">
                  <code class="px-3 py-2 rounded-lg border font-mono text-sm tracking-wider break-all" style="border-color: var(--p-content-border-color)">{{ tfaSecretShown ? tfaSecret : '••••••••••••••••' }}</code>
                  <Button :icon="tfaSecretShown ? 'pi pi-eye-slash' : 'pi pi-eye'" text rounded severity="secondary" :aria-label="t('twofa.reveal')" @click="tfaSecretShown = !tfaSecretShown" />
                  <Button :icon="tfaCopied === 'secret' ? 'pi pi-check' : 'pi pi-copy'" text rounded severity="secondary" :aria-label="t('twofa.copy')" @click="copyText(tfaSecret, 'secret')" />
                </div>
                <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('twofa.secretHint') }}</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style="border-color: var(--p-content-border-color)">
              <InputOtp v-model="tfaCode" :length="6" integer-only @keyup.enter="String(tfaCode).length === 6 && confirmEnable2fa()" />
              <div class="flex gap-2">
                <Button :label="t('common.cancel')" severity="secondary" text @click="cancelEnable2fa" />
                <Button :label="t('twofa.confirm')" :loading="tfaBusy" :disabled="!tfaCode || String(tfaCode).length < 6" @click="confirmEnable2fa" />
              </div>
            </div>
          </template>

          <template v-else>
            <div class="flex items-end gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('account.currentPassword') }}</label>
                <Password v-model="tfaPassword" :feedback="false" toggle-mask @keyup.enter="tfaPassword && startEnable2fa()" />
              </div>
              <Button :label="t('twofa.enable')" :loading="tfaBusy" :disabled="!tfaPassword" @click="startEnable2fa" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <section v-if="!ssoManaged" class="ng-card rounded-2xl border" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('passkeys.title') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('passkeys.hint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-3">
          <Message v-if="pkErr" severity="error" size="small">{{ pkErr }}</Message>
          <div v-if="passkeys.length" class="flex flex-col rounded-xl border divide-y" style="border-color: var(--p-content-border-color)">
            <div v-for="pk in passkeys" :key="pk.id" class="flex items-center gap-3 px-4 py-2.5 text-sm" style="border-color: var(--p-content-border-color)">
              <i class="pi pi-key" style="color: var(--p-primary-color)" />
              <span class="flex-1 truncate font-medium">{{ pk.name || t('passkeys.unnamed') }}</span>
              <span class="text-xs" style="color: var(--p-text-muted-color)">{{ pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : '' }}</span>
              <Button icon="pi pi-trash" size="small" severity="danger" text rounded :aria-label="t('passkeys.remove')" @click="removePasskey(pk.id)" />
            </div>
          </div>
          <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('passkeys.none') }}</div>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">{{ t('passkeys.name') }}</label>
              <InputText v-model="pkName" :placeholder="t('passkeys.namePlaceholder')" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">{{ t('account.currentPassword') }}</label>
              <Password v-model="pkPassword" :feedback="false" toggle-mask />
            </div>
            <div v-if="tfaEnabled" class="flex flex-col gap-1">
              <label class="text-xs font-medium">{{ t('twofa.disableCode') }}</label>
              <InputOtp v-model="pkCode" :length="6" integer-only />
            </div>
            <Button :label="t('passkeys.add')" icon="pi pi-plus" :loading="pkBusy" :disabled="!pkPassword || (tfaEnabled && String(pkCode).length < 6)" @click="addPasskey" />
          </div>
        </div>
      </div>
    </section>

    <section class="ng-card rounded-2xl border" style="background: var(--p-content-background); border-color: color-mix(in srgb, var(--ng-danger) 40%, var(--p-content-border-color))">
      <div class="p-6 flex flex-col gap-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ t('account.dangerTitle') }}</h2>
            <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('account.dangerHint') }}</p>
          </div>
          <Button v-if="!confirming" :label="t('account.deleteAccount')" severity="danger" outlined class="shrink-0" @click="confirming = true" />
        </div>
        <div v-if="confirming" class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div v-if="!ssoManaged" class="flex-1 flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.confirmDeleteHint') }}</label>
            <Password v-model="deletePassword" :feedback="false" toggle-mask fluid :placeholder="t('account.currentPassword')" />
          </div>
          <div v-if="tfaEnabled" class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('twofa.disableCode') }}</label>
            <InputOtp v-model="deleteCode" :length="6" integer-only />
          </div>
          <div class="flex gap-2">
            <Button :label="t('common.cancel')" severity="secondary" text @click="confirming = false" />
            <Button :label="t('account.deleteAccount')" severity="danger" :loading="delLoading" :disabled="(!ssoManaged && !deletePassword) || (tfaEnabled && String(deleteCode).length < 6)" @click="confirmDelete" />
          </div>
        </div>
        <Message v-if="delErr" severity="error" size="small">{{ delErr }}</Message>
      </div>
    </section>
  </div>
</template>
