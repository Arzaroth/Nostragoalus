<script setup lang="ts">
const { t } = useI18n()
const { session, changeEmail, changePassword } = useAuth()

const newEmail = ref('')
const emErr = ref('')
const emMsg = ref('')
const emLoading = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const pwErr = ref('')
const pwMsg = ref('')
const pwLoading = ref(false)

async function onChangeEmail() {
  emLoading.value = true
  emErr.value = ''
  emMsg.value = ''
  const { error } = await changeEmail({ newEmail: newEmail.value })
  emLoading.value = false
  if (error) emErr.value = error.message ?? 'Failed'
  else {
    emMsg.value = t('account.emailChanged')
    newEmail.value = ''
  }
}

async function onChangePassword() {
  pwLoading.value = true
  pwErr.value = ''
  pwMsg.value = ''
  const { error } = await changePassword({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
    revokeOtherSessions: true,
  })
  pwLoading.value = false
  if (error) pwErr.value = error.message ?? 'Failed'
  else {
    pwMsg.value = t('account.passwordChanged')
    currentPassword.value = ''
    newPassword.value = ''
  }
}
</script>

<template>
  <div class="max-w-md mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('account.title') }}</h1>

    <div class="ng-card rounded-2xl border p-5 flex flex-col gap-3" style="background: var(--p-content-background)">
      <h2 class="font-semibold">{{ t('account.email') }}</h2>
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ session?.data?.user?.email }}</p>
      <InputText v-model="newEmail" type="email" :placeholder="t('account.newEmail')" />
      <Message v-if="emErr" severity="error">{{ emErr }}</Message>
      <Message v-if="emMsg" severity="success">{{ emMsg }}</Message>
      <Button :label="t('account.updateEmail')" :loading="emLoading" :disabled="!newEmail" @click="onChangeEmail" />
    </div>

    <div class="ng-card rounded-2xl border p-5 flex flex-col gap-3" style="background: var(--p-content-background)">
      <h2 class="font-semibold">{{ t('account.password') }}</h2>
      <Password v-model="currentPassword" :placeholder="t('account.currentPassword')" :feedback="false" toggle-mask :input-style="{ width: '100%' }" />
      <Password v-model="newPassword" :placeholder="t('account.newPassword')" toggle-mask :input-style="{ width: '100%' }" />
      <Message v-if="pwErr" severity="error">{{ pwErr }}</Message>
      <Message v-if="pwMsg" severity="success">{{ pwMsg }}</Message>
      <Button :label="t('account.updatePassword')" :loading="pwLoading" :disabled="!currentPassword || !newPassword" @click="onChangePassword" />
    </div>
  </div>
</template>
