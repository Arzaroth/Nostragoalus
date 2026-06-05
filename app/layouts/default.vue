<script setup lang="ts">
const { session, signOut } = useAuth()
const { isDark, toggle } = useTheme()
const { t, locale, locales, setLocale } = useI18n()
const router = useRouter()
const config = useRuntimeConfig()

const { data: competitions } = useCompetitions()
const selected = useSelectedCompetition()

watchEffect(() => {
  if (!selected.value && competitions.value?.length) selected.value = competitions.value[0].slug
})

const lang = computed({
  get: () => locale.value,
  set: (value: string) => setLocale(value as 'en' | 'fr'),
})

const navLinks = [
  { to: '/matches', key: 'nav.matches', icon: 'pi pi-calendar' },
  { to: '/bracket', key: 'nav.bracket', icon: 'pi pi-sitemap' },
  { to: '/map', key: 'nav.map', icon: 'pi pi-map' },
  { to: '/leaderboard', key: 'nav.ranking', icon: 'pi pi-trophy' },
  { to: '/predictions', key: 'nav.myPicks', icon: 'pi pi-check-circle' },
]

async function onSignOut() {
  await signOut()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header
      class="sticky top-0 z-50 backdrop-blur-md border-b"
      style="background: color-mix(in srgb, var(--p-content-background) 82%, transparent); border-color: var(--p-content-border-color)"
    >
      <div class="mx-auto max-w-7xl px-4 h-16 flex items-center gap-3">
        <NuxtLink to="/" class="flex items-center gap-2 font-extrabold text-lg shrink-0">
          <span class="text-2xl">🔮</span>
          <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
            {{ config.public.appName }}
          </span>
        </NuxtLink>

        <Select
          v-if="competitions && competitions.length"
          v-model="selected"
          :options="competitions"
          option-label="name"
          option-value="slug"
          size="small"
          class="ml-1 max-w-52"
        />

        <nav class="hidden md:flex items-center gap-1 ml-2">
          <NuxtLink
            v-for="l in navLinks"
            :key="l.to"
            :to="l.to"
            class="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
            active-class="!text-[var(--p-primary-color)] bg-black/5 dark:bg-white/10"
          >
            <i :class="l.icon" />{{ t(l.key) }}
          </NuxtLink>
        </nav>

        <div class="flex-1" />

        <Select
          v-model="lang"
          :options="locales"
          option-label="name"
          option-value="code"
          size="small"
          class="w-32"
        />

        <Button
          :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
          text
          rounded
          severity="secondary"
          aria-label="Toggle theme"
          @click="toggle"
        />

        <template v-if="session && session.data">
          <NuxtLink to="/account" :title="t('account.title')">
            <Avatar
              :label="(session.data.user.name || '?').charAt(0).toUpperCase()"
              shape="circle"
              class="!bg-[var(--p-primary-color)] !text-[var(--p-primary-contrast-color)] font-bold cursor-pointer"
            />
          </NuxtLink>
          <Button :label="t('nav.signOut')" size="small" severity="secondary" text @click="onSignOut" />
        </template>
        <NuxtLink v-else to="/login">
          <Button :label="t('nav.signIn')" size="small" />
        </NuxtLink>
      </div>

      <nav class="md:hidden flex items-center gap-2 px-4 pb-2 overflow-x-auto text-sm">
        <NuxtLink
          v-for="l in navLinks"
          :key="l.to"
          :to="l.to"
          class="px-2 py-1 rounded-lg whitespace-nowrap flex items-center gap-1"
          active-class="!text-[var(--p-primary-color)]"
        >
          <i :class="l.icon" />{{ t(l.key) }}
        </NuxtLink>
      </nav>
    </header>

    <main class="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
