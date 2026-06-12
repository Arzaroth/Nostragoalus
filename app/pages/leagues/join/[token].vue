<script setup lang="ts">
interface InvitePreview {
  status: 'VALID' | 'EXPIRED' | 'EXHAUSTED'
  league: { id: string; name: string; memberCount: number }
  competition: { slug: string; name: string } | null
  alreadyMember: boolean
  authenticated: boolean
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token))

const { data: preview, error } = await useFetch<InvitePreview>(() => `/api/leagues/invite/${token.value}`)

const joining = ref(false)
const joinError = ref('')

async function accept() {
  if (!preview.value) return
  if (!preview.value.authenticated) {
    // Bounce through login, come back here, auto-accept on return.
    await router.push({ path: '/login', query: { next: route.fullPath } })
    return
  }
  joining.value = true
  joinError.value = ''
  try {
    const res = await $fetch<{ league: { id: string } }>(`/api/leagues/invite/${token.value}/accept`, { method: 'POST' })
    await router.push(`/leagues/${res.league.id}`)
  } catch (e: any) {
    // Already a member is a success-shaped outcome: just go to the league.
    if (e?.statusCode === 409 && preview.value.alreadyMember) {
      await router.push(`/leagues/${preview.value.league.id}`)
      return
    }
    joinError.value = e?.data?.statusMessage || t('invites.joinFailed')
  } finally {
    joining.value = false
  }
}

// Returning from login with a valid invite: accept without a second click.
onMounted(() => {
  if (preview.value?.authenticated && preview.value.status === 'VALID' && !preview.value.alreadyMember) {
    void accept()
  }
})

useHead({ title: t('invites.joinTitle') })
</script>

<template>
  <div class="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center">
    <img src="/brand/mark.svg" alt="Nostragoalus" class="w-20" >

    <div v-if="error || !preview" class="ng-card rounded-2xl border p-6 w-full" style="background: var(--p-content-background)">
      <i class="pi pi-times-circle text-3xl" style="color: var(--ng-danger)" />
      <p class="mt-3 font-medium">{{ t('invites.notFound') }}</p>
      <NuxtLink to="/leagues" class="text-sm inline-block mt-4" style="color: var(--p-primary-color)">{{ t('invites.browseLeagues') }}</NuxtLink>
    </div>

    <div v-else class="ng-card rounded-2xl border p-6 w-full flex flex-col gap-4" style="background: var(--p-content-background)">
      <div>
        <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('invites.invitedTo') }}</p>
        <h1 class="text-2xl font-bold mt-1">{{ preview.league.name }}</h1>
        <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">
          <span v-if="preview.competition">{{ preview.competition.name }} · </span>
          {{ t('invites.memberCount', { n: preview.league.memberCount }) }}
        </p>
      </div>

      <template v-if="preview.alreadyMember">
        <Message severity="info" size="small">{{ t('invites.alreadyMember') }}</Message>
        <NuxtLink :to="`/leagues/${preview.league.id}`">
          <Button :label="t('invites.goToLeague')" class="w-full" icon="pi pi-arrow-right" icon-pos="right" />
        </NuxtLink>
      </template>

      <template v-else-if="preview.status === 'EXPIRED'">
        <Message severity="warn" size="small">{{ t('invites.expired') }}</Message>
      </template>
      <template v-else-if="preview.status === 'EXHAUSTED'">
        <Message severity="warn" size="small">{{ t('invites.exhausted') }}</Message>
      </template>

      <template v-else>
        <Message v-if="joinError" severity="error" size="small">{{ joinError }}</Message>
        <Button
          :label="preview.authenticated ? t('invites.accept') : t('invites.signInToJoin')"
          class="w-full"
          icon="pi pi-check"
          icon-pos="right"
          :loading="joining"
          @click="accept"
        />
      </template>
    </div>
  </div>
</template>
