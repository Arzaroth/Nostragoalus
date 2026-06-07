export default defineNuxtPlugin(() => {
  const { isDark, preference, apply } = useTheme()
  const stored = localStorage.getItem('theme')
  preference.value = stored === 'dark' || stored === 'light' ? stored : 'system'
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  isDark.value = stored ? stored === 'dark' : prefersDark
  apply()
})
