<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const mine = useMyLeagues()
const { data: competitions } = useCompetitions()
const { joinPublic } = useLeagueActions()

const joinOpen = ref(false)
const createOpen = ref(route.query.create === '1')
if (route.query.create) router.replace({ query: { ...route.query, create: undefined } })

// Public browsing is competition-scoped; default to the last viewed one.
const browseSlug = ref<string | undefined>(useLastCompetition().value)
const publicLeagues = usePublicLeagues(browseSlug)
const myIds = computed(() => new Set((mine.data.value ?? []).map((l) => l.id)))

const grouped = computed(() => {
  const groups = new Map<string, { name: string; leagues: NonNullable<typeof mine.data.value> }>()
  for (const l of mine.data.value ?? []) {
    const g = groups.get(l.competition.slug) ?? { name: l.competition.name, leagues: [] }
    g.leagues.push(l)
    groups.set(l.competition.slug, g)
  }
  return [...groups.entries()].map(([slug, g]) => ({ slug, ...g }))
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <h1 class="text-2xl font-bold">{{ t('leagues.title') }}</h1>
      <div class="flex gap-2">
        <Button :label="t('leagues.join')" severity="secondary" outlined size="small" icon="pi pi-sign-in" @click="joinOpen = true" />
        <Button :label="t('leagues.create')" size="small" icon="pi pi-plus" @click="createOpen = true" />
      </div>
    </div>

    <div v-if="mine.isLoading.value" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!grouped.length" class="opacity-60 mb-8">{{ t('leagues.empty') }}</div>
    <div v-else class="flex flex-col gap-6 mb-10">
      <section v-for="g in grouped" :key="g.slug">
        <h2 class="text-sm font-semibold uppercase tracking-wider mb-2" style="color: var(--p-text-muted-color)">{{ g.name }}</h2>
        <div class="flex flex-col gap-3">
          <LeagueCard v-for="l in g.leagues" :key="l.id" :league="l" />
        </div>
      </section>
    </div>

    <section>
      <div class="flex items-center gap-3 flex-wrap mb-3">
        <h2 class="text-lg font-bold">{{ t('leagues.public') }}</h2>
        <Select
          v-model="browseSlug"
          :options="competitions ?? []"
          option-label="name"
          option-value="slug"
          size="small"
          class="w-56"
        />
      </div>
      <div v-if="publicLeagues.isLoading.value" class="opacity-60">{{ t('common.loading') }}</div>
      <div v-else-if="!publicLeagues.data.value?.length" class="opacity-60">{{ t('leagues.publicEmpty') }}</div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="l in publicLeagues.data.value"
          :key="l.id"
          class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <i class="pi pi-users" style="color: var(--p-primary-color)" />
          <NuxtLink :to="`/leagues/${l.id}`" class="font-semibold hover:underline truncate flex-1 min-w-0">{{ l.name }}</NuxtLink>
          <span class="text-xs shrink-0" style="color: var(--p-text-muted-color)">{{ t('leagues.memberCount', { n: l.memberCount }, l.memberCount) }}</span>
          <NuxtLink :to="`/leagues/${l.id}`" class="text-sm shrink-0" style="color: var(--p-primary-color)">{{ t('leagues.viewRankings') }}</NuxtLink>
          <Button
            v-if="!myIds.has(l.id)"
            :label="t('leagues.joinPublic')"
            size="small"
            :loading="joinPublic.isPending.value && joinPublic.variables.value === l.id"
            @click="joinPublic.mutate(l.id)"
          />
        </div>
      </div>
    </section>

    <LeagueJoinDialog v-model:visible="joinOpen" @joined="joinOpen = false" />
    <LeagueCreateDialog v-model:visible="createOpen" show-competition @created="createOpen = false" />
  </div>
</template>
