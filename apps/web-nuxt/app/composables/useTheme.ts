export type ThemePref = 'light' | 'dark' | 'system'

export function useTheme() {
  const isDark = useState('theme-dark', () => false)
  const preference = useState<ThemePref>('theme-pref', () => 'system')
  const prefersDark = usePreferredDark()

  function apply() {
    if (import.meta.client) {
      document.documentElement.classList.toggle('app-dark', isDark.value)
    }
  }

  function resolve(pref: ThemePref): boolean {
    if (pref !== 'system') return pref === 'dark'
    return import.meta.client ? prefersDark.value : false
  }

  // 'system' keeps following the OS (and clears the localStorage override the
  // anti-FOUC boot script reads); explicit prefs pin it.
  function setPreference(pref: ThemePref) {
    preference.value = pref
    isDark.value = resolve(pref)
    if (import.meta.client) {
      if (pref === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', pref)
    }
    apply()
  }

  function toggle() {
    setPreference(isDark.value ? 'light' : 'dark')
  }

  return { isDark, preference, setPreference, toggle, apply }
}
