<script setup lang="ts">
const { t } = useI18n()
const { session, changeEmail, changePassword, updateUser, deleteUser, signOut } = useAuth()
const router = useRouter()

const currentUser = computed(() => session.value?.data?.user)

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
