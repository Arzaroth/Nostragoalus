<script setup lang="ts">
const { t } = useI18n()
const NuxtLinkC = resolveComponent('NuxtLink')
const slug = useSelectedCompetition()
const { query, setPick } = useChampion()
const data = computed<any>(() => query.data.value)
const selectedCode = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  selectedCode.value = data.value?.myPick?.teamCode ?? null
})

function teamName(code: string | null) {
  return data.value?.teams?.find((tm: ChampionTeam) => tm.code === code)?.name ?? code
}
function save() {
  const team = data.value?.teams?.find((tm: ChampionTeam) => tm.code === selectedCode.value)
  if (team) setPick.mutate(team)
}

// What the crown showcase displays: the live selection (preview) or the saved pick.
const showcaseCode = computed(() =>
  data.value?.locked ? (data.value?.myPick?.teamCode ?? null) : (selectedCode.value ?? data.value?.myPick?.teamCode ?? null),
)
const isSaved = computed(() => !!data.value?.myPick && showcaseCode.value === data.value.myPick.teamCode)
</script>

<template>
  <div v-if="data && data.competition" class="ng-card rounded-2xl border p-5 mb-6" style="background: var(--p-content-background)">
    <div class="flex flex-col sm:flex-row sm:items-center gap-6">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 font-semibold text-lg mb-1"><span class="text-2xl">🏆</span> {{ t('champion.title') }}</div>
        <p class="text-sm mb-4" style="color: var(--p-text-muted-color)">{{ t('champion.hint') }}</p>

        <template v-if="data.locked">
          <span v-if="!data.myPick" style="color: var(--p-text-muted-color)">{{ t('champion.noPick') }}</span>
          <span v-else class="inline-flex items-center gap-2 text-sm" style="color: var(--p-text-muted-color)">
            <i class="pi pi-lock text-xs" /> {{ t('champion.lockedIn') }}
          </span>
        </template>

        <template v-else>
          <div class="flex flex-wrap items-center gap-3">
            <Select
              v-model="selectedCode"
              :options="data.teams"
              option-label="name"
              option-value="code"
              filter
              :placeholder="t('champion.pick')"
              class="w-full sm:w-72"
            >
              <template #value="{ value, placeholder }">
                <span v-if="value" class="flex items-center gap-2">
                  <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ teamName(value) }}
                </span>
                <span v-else>{{ placeholder }}</span>
              </template>
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ option.name }}
                </span>
              </template>
            </Select>
            <Button
              :label="t('common.save')"
              icon="pi pi-check"
              :disabled="!selectedCode || selectedCode === data.myPick?.teamCode"
              :loading="saving"
              @click="save"
            />
          </div>
        </template>
      </div>

      <!-- Crowned champion showcase -->
      <div class="shrink-0 flex flex-col items-center gap-2 self-center sm:pr-8">
        <component :is="showcaseCode ? NuxtLinkC : 'div'" :to="showcaseCode ? `/${slug}/teams/${showcaseCode}` : undefined" class="relative mt-3 block" :class="{ 'hover:opacity-90': showcaseCode }">
          <template v-if="showcaseCode">
            <div
              class="absolute -inset-5 rounded-full blur-xl pointer-events-none"
              style="background: radial-gradient(circle, rgba(245, 179, 1, 0.4), transparent 70%)"
            />
            <span
              class="absolute -top-4 -left-4 text-3xl z-10 select-none"
              style="transform: rotate(-25deg); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))"
            >👑</span>
            <img
              v-if="flagUrl(showcaseCode)"
              :src="flagUrl(showcaseCode) || ''"
              class="relative w-20 h-20 rounded-2xl object-cover"
              style="box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.6), 0 10px 24px rgba(0, 0, 0, 0.3)"
              alt=""
            >
          </template>
          <template v-else>
            <span class="absolute -top-4 -left-4 text-3xl z-10 opacity-30 grayscale select-none" style="transform: rotate(-25deg)">👑</span>
            <div
              class="w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center text-2xl"
              style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
            >?</div>
          </template>
        </component>
        <div class="text-center">
          <component :is="NuxtLinkC" v-if="showcaseCode" :to="`/${slug}/teams/${showcaseCode}`" class="hover:underline">
            <strong class="block leading-tight">{{ teamName(showcaseCode) }}</strong>
          </component>
          <span v-else class="block text-sm leading-tight" style="color: var(--p-text-muted-color)">{{ t('champion.pick') }}</span>
          <!-- one reserved line: points / preview hint / invisible spacer - the card never resizes -->
          <span v-if="isSaved && data.myPick?.awardedPoints > 0" class="text-xs block mt-0.5 font-bold" style="color: #22c55e">+{{ data.myPick.awardedPoints }} pts</span>
          <span
            v-else
            class="text-xs block mt-0.5"
            :class="{ invisible: !(showcaseCode && !isSaved && !data.locked) }"
            style="color: var(--p-text-muted-color)"
          >{{ t('champion.preview') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
