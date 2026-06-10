<script setup lang="ts">
import type { League, LeagueVisibility } from '../composables/useLeagues'

const visible = defineModel<boolean>('visible', { required: true })
const props = defineProps<{ showCompetition?: boolean }>()
const emit = defineEmits<{ created: [league: League] }>()

const { t } = useI18n()
const { create } = useLeagueActions()
const { data: competitions } = useCompetitions()
const currentSlug = useSelectedCompetition()

const name = ref('')
const visibility = ref<LeagueVisibility>('PRIVATE')
const competition = ref<string>('')
const error = ref('')

const visibilityOptions = computed(() => [
  { label: t('leagues.visibilityPrivate'), value: 'PRIVATE' },
  { label: t('leagues.visibilityPublic'), value: 'PUBLIC' },
])

watch(visible, (open) => {
  if (open) {
    name.value = ''
    visibility.value = 'PRIVATE'
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
