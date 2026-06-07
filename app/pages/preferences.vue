<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
const { updateUser } = useAuth()
const { preference, setPreference } = useTheme()

const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined
async function persist(fields: Record<string, string>) {
  await (updateUser as (f: Record<string, string>) => Promise<unknown>)(fields)
  saved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (saved.value = false), 1500)
}

const lang = computed({
  get: () => locale.value,
  set: (v: string) => {
    void setLocale(v as 'en' | 'fr')
    void persist({ locale: v })
  },
})
const theme = computed({
  get: () => preference.value,
  set: (v: ThemePref) => {
    setPreference(v)
    void persist({ theme: v })
  },
})

const langOptions = [
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
]
const themeOptions = computed(() => [
  { label: t('prefs.light'), value: 'light', icon: 'pi pi-sun' },
  { label: t('prefs.dark'), value: 'dark', icon: 'pi pi-moon' },
  { label: t('prefs.system'), value: 'system', icon: 'pi pi-desktop' },
])
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('prefs.title') }}</h1>

    <section class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
      <div class="grid md:grid-cols-3 gap-6 p-6">
        <div>
          <h2 class="font-semibold">{{ t('prefs.title') }}</h2>
          <p class="text-sm mt-1" style="color: var(--p-text-muted-color)">{{ t('prefs.hint') }}</p>
        </div>
        <div class="md:col-span-2 flex flex-col gap-5">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('prefs.language') }}</label>
            <Select v-model="lang" :options="langOptions" option-label="label" option-value="value" class="w-full sm:w-60" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">{{ t('prefs.theme') }}</label>
            <SelectButton v-model="theme" :options="themeOptions" option-label="label" option-value="value" :allow-empty="false">
              <template #option="{ option }">
                <span class="flex items-center gap-2"><i :class="option.icon" />{{ option.label }}</span>
              </template>
            </SelectButton>
          </div>
          <div class="h-4 text-xs" style="color: var(--p-primary-color)">
            <span v-if="saved"><i class="pi pi-check" /> {{ t('prefs.saved') }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
