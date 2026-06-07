// Applies the signed-in user's saved preferences (locale + theme). Users without
// saved values keep the detected browser/system defaults untouched.
export default defineNuxtPlugin((nuxtApp) => {
  const { session } = useAuth()
  const { preference, setPreference } = useTheme()

  watch(
    () => session.value?.data?.user as { locale?: string | null; theme?: string | null } | null | undefined,
    (u) => {
      if (!u) return
      if ((u.theme === 'light' || u.theme === 'dark' || u.theme === 'system') && u.theme !== preference.value) {
        setPreference(u.theme)
      }
      const i18n = nuxtApp.$i18n as unknown as { locale: { value: string }; setLocale: (l: 'en' | 'fr') => Promise<void> } | undefined
      if ((u.locale === 'en' || u.locale === 'fr') && i18n && i18n.locale.value !== u.locale) {
        void i18n.setLocale(u.locale)
      }
    },
    { immediate: true },
  )
})
