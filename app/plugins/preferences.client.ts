// Applies the signed-in user's saved preferences (locale + theme + skin). Users
// without saved values keep the detected browser/system defaults untouched.
export default defineNuxtPlugin((nuxtApp) => {
  const { session } = useAuth()
  const { preference, setPreference } = useTheme()
  const { hydrate: hydrateSkin } = useSkin()

  watch(
    () =>
      session.value?.data?.user as
        | { locale?: string | null; theme?: string | null; skin?: string | null; skinsUnlocked?: boolean | null }
        | null
        | undefined,
    (u) => {
      if (!u) return
      if ((u.theme === 'light' || u.theme === 'dark' || u.theme === 'system') && u.theme !== preference.value) {
        setPreference(u.theme)
      }
      hydrateSkin(u)
      const i18n = nuxtApp.$i18n as unknown as { locale: { value: string }; setLocale: (l: string) => Promise<void> } | undefined
      if (u.locale && ['en', 'fr', 'th', 'tlh'].includes(u.locale) && i18n && i18n.locale.value !== u.locale) {
        void i18n.setLocale(u.locale)
      }
    },
    { immediate: true },
  )
})
