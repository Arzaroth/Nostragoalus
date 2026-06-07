<script setup lang="ts">
import QRCode from 'qrcode'
import { authClient } from '../../lib/auth-client'

const { t } = useI18n()
const { session, changeEmail, changePassword, updateUser, deleteUser, signOut } = useAuth()
const router = useRouter()

const currentUser = computed(() => session.value?.data?.user)

// --- Two-factor authentication ---
const tfaPassword = ref('')
const tfaCode = ref('')
const tfaQr = ref('')
const tfaBackup = ref<string[]>([])
const tfaStep = ref<'idle' | 'verify' | 'done'>('idle')
const tfaErr = ref('')
const tfaBusy = ref(false)
const tfaEnabled = computed(() => (currentUser.value as any)?.twoFactorEnabled === true || tfaStep.value === 'done')

async function startEnable2fa() {
  tfaErr.value = ''
  tfaBusy.value = true
  try {
    const res = await authClient.twoFactor.enable({ password: tfaPassword.value })
    if (res.error) {
      tfaErr.value = res.error.message || t('twofa.wrongPassword')
      return
    }
    tfaBackup.value = res.data?.backupCodes ?? []
    tfaQr.value = await QRCode.toDataURL(res.data?.totpURI ?? '', { margin: 1, width: 192 })
    tfaStep.value = 'verify'
  } finally {
    tfaBusy.value = false
  }
}
async function confirmEnable2fa() {
  tfaErr.value = ''
  tfaBusy.value = true
  try {
    const res = await authClient.twoFactor.verifyTotp({ code: tfaCode.value.trim() })
    if (res.error) {
      tfaErr.value = t('twofa.wrongCode')
      return
    }
    tfaStep.value = 'done'
    tfaPassword.value = ''
    tfaCode.value = ''
  } finally {
    tfaBusy.value = false
  }
}
async function disable2fa() {
  tfaErr.value = ''
  tfaBusy.value = true
  try {
    const res = await authClient.twoFactor.disable({ password: tfaPassword.value })
    if (res.error) {
      tfaErr.value = res.error.message || t('twofa.wrongPassword')
      return
    }
    tfaStep.value = 'idle'
    tfaPassword.value = ''
    tfaQr.value = ''
    tfaBackup.value = []
    await session.value?.refetch?.()
  } finally {
    tfaBusy.value = false
  }
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

// Resize + square-crop the chosen image to a small data URL (no upload infra needed).
function resizeToDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => reject(new Error('invalid image'))
    img.src = URL.createObjectURL(file)
  })
}
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
    if (email.value && email.value !== u?.email) {
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
const delErr = ref('')
const delLoading = ref(false)
async function confirmDelete() {
  delErr.value = ''
  delLoading.value = true
  const { error } = await deleteUser({ password: deletePassword.value })
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

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.email') }}</label>
            <IconField>
              <InputIcon class="pi pi-envelope" />
              <InputText v-model="email" type="email" class="w-full" />
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

    <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
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

    <section class="ng-card rounded-2xl border" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('twofa.sectionTitle') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('twofa.sectionHint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-3">
          <Message v-if="tfaErr" severity="error" size="small">{{ tfaErr }}</Message>

          <template v-if="tfaEnabled">
            <div class="flex items-center gap-2 text-sm font-medium"><i class="pi pi-shield" style="color: #22c55e" /> {{ t('twofa.enabled') }}</div>
            <div v-if="tfaBackup.length" class="rounded-xl border p-3" style="border-color: var(--p-content-border-color)">
              <div class="text-xs mb-2" style="color: var(--p-text-muted-color)">{{ t('twofa.backupHintLong') }}</div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 font-mono text-xs">
                <span v-for="c in tfaBackup" :key="c">{{ c }}</span>
              </div>
            </div>
            <div class="flex items-end gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('account.currentPassword') }}</label>
                <Password v-model="tfaPassword" :feedback="false" toggle-mask />
              </div>
              <Button :label="t('twofa.disable')" severity="danger" outlined :loading="tfaBusy" :disabled="!tfaPassword" @click="disable2fa" />
            </div>
          </template>

          <template v-else-if="tfaStep === 'verify'">
            <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('twofa.scan') }}</p>
            <img :src="tfaQr" alt="TOTP QR" class="w-44 h-44 rounded-lg bg-white p-2 self-start" >
            <div v-if="tfaBackup.length" class="rounded-xl border p-3" style="border-color: var(--p-content-border-color)">
              <div class="text-xs mb-2" style="color: var(--p-text-muted-color)">{{ t('twofa.backupHintLong') }}</div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 font-mono text-xs">
                <span v-for="c in tfaBackup" :key="c">{{ c }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <InputText v-model="tfaCode" :placeholder="t('twofa.code')" class="w-40 text-center tracking-widest" @keyup.enter="confirmEnable2fa" />
              <Button :label="t('twofa.confirm')" :loading="tfaBusy" :disabled="!tfaCode.trim()" @click="confirmEnable2fa" />
            </div>
          </template>

          <template v-else>
            <div class="flex items-end gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ t('account.currentPassword') }}</label>
                <Password v-model="tfaPassword" :feedback="false" toggle-mask />
              </div>
              <Button :label="t('twofa.enable')" :loading="tfaBusy" :disabled="!tfaPassword" @click="startEnable2fa" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <section class="ng-card rounded-2xl border" style="background: var(--p-content-background); border-color: color-mix(in srgb, #ef4444 40%, var(--p-content-border-color))">
      <div class="p-6 flex flex-col gap-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ t('account.dangerTitle') }}</h2>
            <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('account.dangerHint') }}</p>
          </div>
          <Button v-if="!confirming" :label="t('account.deleteAccount')" severity="danger" outlined class="shrink-0" @click="confirming = true" />
        </div>
        <div v-if="confirming" class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="flex-1 flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('account.confirmDeleteHint') }}</label>
            <Password v-model="deletePassword" :feedback="false" toggle-mask fluid :placeholder="t('account.currentPassword')" />
          </div>
          <div class="flex gap-2">
            <Button :label="t('common.cancel')" severity="secondary" text @click="confirming = false" />
            <Button :label="t('account.deleteAccount')" severity="danger" :loading="delLoading" :disabled="!deletePassword" @click="confirmDelete" />
          </div>
        </div>
        <Message v-if="delErr" severity="error" size="small">{{ delErr }}</Message>
      </div>
    </section>
  </div>
</template>
