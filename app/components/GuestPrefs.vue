<script setup lang="ts">
// Minimal language/theme controls for signed-out pages — the choices stick via
// the i18n cookie + localStorage, and survive first login (no saved prefs yet).
const { locale, locales, setLocale } = useI18n()
const { isDark, toggle } = useTheme()

const lang = computed({
  get: () => locale.value,
  set: (v: string) => {
    void setLocale(v as 'en' | 'fr' | 'th' | 'tlh')
  },
})
</script>

<template>
  <div class="flex items-center justify-end gap-1">
    <Select v-model="lang" :options="locales" option-label="name" option-value="code" size="small" class="w-48" />
    <Button :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'" text rounded severity="secondary" aria-label="Toggle theme" @click="toggle" />
  </div>
</template>
