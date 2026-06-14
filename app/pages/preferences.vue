<script setup lang="ts">
import { showOddsEnabled } from '../utils/prefs'
import { SKINS, type SkinId } from '../utils/skins'
const { t, locale, setLocale } = useI18n()
const { session, updateUser } = useAuth()
const { preference, setPreference } = useTheme()
const { skin, unlocked, setSkin } = useSkin()

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
    void setLocale(v as 'en' | 'fr' | 'th' | 'tlh')
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

const showCrowd = computed({
  get: () => (session.value?.data?.user as any)?.showCrowd === true,
  set: async (v: boolean) => {
    await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)({ showCrowd: v })
    persistFlash()
  },
})

// Opt-in (default off): unset means hidden - rule shared with useOddsPreference.
const showOdds = computed({
  get: () => showOddsEnabled(session.value?.data?.user),
  set: async (v: boolean) => {
    await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)({ showOdds: v })
    persistFlash()
  },
})

const profilePrivate = computed({
  get: () => (session.value?.data?.user as any)?.profilePrivate === true,
  set: async (v: boolean) => {
    await (updateUser as (f: Record<string, unknown>) => Promise<unknown>)({ profilePrivate: v })
    persistFlash()
  },
})
function persistFlash() {
  saved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (saved.value = false), 1500)
}

const langOptions = [
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
  { label: 'ไทย (Thai)', value: 'th' },
  { label: 'tlhIngan Hol (Klingon)', value: 'tlh' },
]
const themeOptions = computed(() => [
  { label: t('prefs.light'), value: 'light', icon: 'pi pi-sun' },
  { label: t('prefs.dark'), value: 'dark', icon: 'pi pi-moon' },
  { label: t('prefs.system'), value: 'system', icon: 'pi pi-desktop' },
])

// Konami-unlocked cosmetic skins. '' is the default (un-skinned) theme.
type SkinChoice = '' | SkinId
const skinOptions = computed(() => [
  { value: '' as SkinChoice, label: t('skins.default'), swatch: null as string | null, rainbow: false },
  ...SKINS.map((s) => ({ value: s.id as SkinChoice, label: t(`skins.${s.id}`), swatch: s.swatch as string | null, rainbow: s.rainbow === true })),
])
const skinModel = computed({
  get: (): SkinChoice => skin.value ?? '',
  set: (v: SkinChoice) => {
    setSkin(v || null)
    persistFlash()
  },
})
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
          <div v-if="unlocked" class="flex flex-col gap-1" data-testid="skin-picker">
            <label class="text-sm font-medium">{{ t('skins.title') }}</label>
            <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('skins.hint') }}</p>
            <div class="flex flex-wrap gap-2 mt-1">
              <button
                v-for="opt in skinOptions"
                :key="opt.value"
                type="button"
                class="ng-skin-chip"
                :class="{ 'ng-skin-chip--active': skinModel === opt.value }"
                :aria-pressed="skinModel === opt.value"
                @click="skinModel = opt.value"
              >
                <span
                  class="ng-skin-dot"
                  :class="{ 'ng-skin-dot--rainbow': opt.rainbow, 'ng-skin-dot--none': !opt.swatch }"
                  :style="opt.swatch && !opt.rainbow ? { background: opt.swatch } : undefined"
                />
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="h-4 text-xs" style="color: var(--p-primary-color)">
            <span v-if="saved"><i class="pi pi-check" /> {{ t('prefs.saved') }}</span>
          </div>
          <div class="flex items-start gap-3 pt-1">
            <ToggleSwitch v-model="showCrowd" input-id="show-crowd" class="shrink-0 mt-0.5" />
            <label for="show-crowd" class="flex flex-col cursor-pointer">
              <span class="text-sm font-medium">{{ t('prefs.crowd') }}</span>
              <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('prefs.crowdHint') }}</span>
            </label>
          </div>
          <div class="flex items-start gap-3 pt-1">
            <ToggleSwitch v-model="showOdds" input-id="show-odds" class="shrink-0 mt-0.5" />
            <label for="show-odds" class="flex flex-col cursor-pointer">
              <span class="text-sm font-medium">{{ t('prefs.odds') }}</span>
              <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('prefs.oddsHint') }}</span>
            </label>
          </div>
          <div class="flex items-start gap-3">
            <ToggleSwitch v-model="profilePrivate" input-id="profile-private" class="shrink-0 mt-0.5" />
            <label for="profile-private" class="flex flex-col cursor-pointer">
              <span class="text-sm font-medium">{{ t('prefs.privateProfile') }}</span>
              <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('prefs.privateProfileHint') }}</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ng-skin-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border: 1px solid var(--p-content-border-color, #d8dcef);
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
  background: var(--p-content-background);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ng-skin-chip:hover {
  border-color: var(--p-primary-color);
}
.ng-skin-chip--active {
  border-color: var(--p-primary-color);
  box-shadow: inset 0 0 0 1px var(--p-primary-color);
  font-weight: 600;
}
.ng-skin-dot {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex: none;
}
.ng-skin-dot--none {
  background: linear-gradient(135deg, #c7d2fe, #6366f1);
}
.ng-skin-dot--rainbow {
  background: conic-gradient(#ff5a5a, #ffd23f, #4bbf5a, #3fb6ff, #8b5fd0, #ff5a5a);
}
</style>
