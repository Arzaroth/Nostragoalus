export function useTheme() {
  const isDark = useState('theme-dark', () => false)

  function apply() {
    if (import.meta.client) {
      document.documentElement.classList.toggle('app-dark', isDark.value)
    }
  }

  function toggle() {
    isDark.value = !isDark.value
    if (import.meta.client) localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
    apply()
  }

  return { isDark, toggle, apply }
}
