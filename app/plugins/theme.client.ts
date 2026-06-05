export default defineNuxtPlugin(() => {
  const { isDark, apply } = useTheme()
  const stored = localStorage.getItem('theme')
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  isDark.value = stored ? stored === 'dark' : prefersDark
  apply()
})
