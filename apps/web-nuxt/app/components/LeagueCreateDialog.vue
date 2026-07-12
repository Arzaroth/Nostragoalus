<script setup lang="ts">
import { LEAGUE_MODES, type League, type LeagueMode, type LeagueVisibility } from '../composables/useLeagues'

const visible = defineModel<boolean>('visible', { required: true })
const props = defineProps<{ showCompetition?: boolean }>()
const emit = defineEmits<{ created: [league: League] }>()

const { t } = useI18n()
const { create } = useLeagueActions()
const { data: competitions } = useCompetitions()
const currentSlug = useSelectedCompetition()

const name = ref('')
const visibility = ref<LeagueVisibility>('PRIVATE')
const mode = ref<LeagueMode>('NORMAL')
const lives = ref(1)
const competition = ref<string>('')
const error = ref('')

const visibilityOptions = computed(() => [
  { label: t('leagues.visibilityPrivate'), value: 'PRIVATE' },
  { label: t('leagues.visibilityPublic'), value: 'PUBLIC' },
])

const MODE_KEY: Record<LeagueMode, string> = { NORMAL: 'Normal', EASY: 'Easy', HARD: 'Hard', HARDCORE: 'Hardcore' }
const modeOptions = computed(() =>
  LEAGUE_MODES.map((value) => ({
    value,
    label: t(`leagues.mode${MODE_KEY[value]}`),
    description: t(`leagues.mode${MODE_KEY[value]}Desc`),
  })),
)

watch(visible, (open) => {
  if (open) {
    name.value = ''
    visibility.value = 'PRIVATE'
    mode.value = 'NORMAL'
    lives.value = 1
    competition.value = currentSlug.value
    error.value = ''
  }
})

async function submit() {
  if (name.value.trim().length < 3) return
  error.value = ''
  try {
    const league = await create.mutateAsync({
      competition: props.showCompetition ? competition.value : currentSlug.value,
      name: name.value.trim(),
      visibility: visibility.value,
      mode: mode.value,
      lives: mode.value === 'HARDCORE' ? lives.value : undefined,
    })
    emit('created', league)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || String(e)
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :draggable="false" :header="t('leagues.createTitle')" class="w-full max-w-sm mx-4">
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <label class="text-sm font-medium" for="league-name">{{ t('leagues.nameLabel') }}</label>
      <InputText id="league-name" v-model="name" :placeholder="t('leagues.namePlaceholder')" autofocus class="w-full" maxlength="50" />
      <template v-if="props.showCompetition">
        <label class="text-sm font-medium" for="league-competition">{{ t('leagues.competitionLabel') }}</label>
        <Select
          id="league-competition"
          v-model="competition"
          :options="competitions ?? []"
          option-label="name"
          option-value="slug"
          class="w-full"
        />
      </template>
      <label class="text-sm font-medium">{{ t('leagues.visibilityLabel') }}</label>
      <div class="flex flex-col gap-2">
        <label v-for="opt in visibilityOptions" :key="opt.value" class="flex items-center gap-2 text-sm">
          <RadioButton v-model="visibility" :value="opt.value" />
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <label class="text-sm font-medium">{{ t('leagues.modeLabel') }}</label>
      <div class="flex flex-col gap-2">
        <label v-for="opt in modeOptions" :key="opt.value" class="flex items-start gap-2 text-sm">
          <RadioButton v-model="mode" :value="opt.value" class="mt-0.5" />
          <span>
            <span class="font-medium">{{ opt.label }}</span>
            <span class="block text-xs text-surface-500 dark:text-surface-400">{{ opt.description }}</span>
          </span>
        </label>
      </div>
      <template v-if="mode === 'HARDCORE'">
        <label class="text-sm font-medium" for="league-lives">{{ t('leagues.livesLabel') }}</label>
        <InputNumber id="league-lives" v-model="lives" :min="1" :max="99" show-buttons class="w-full" />
      </template>
      <Message v-if="error" severity="error" size="small" variant="simple">{{ error }}</Message>
      <div class="flex justify-end gap-2 mt-1">
        <Button type="button" :label="t('common.cancel')" severity="secondary" text @click="visible = false" />
        <Button
          type="submit"
          :label="t('leagues.createSubmit')"
          :loading="create.isPending.value"
          :disabled="name.trim().length < 3"
        />
      </div>
    </form>
  </Dialog>
</template>
