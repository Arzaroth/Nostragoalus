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

const { data: adminStatus } = useFetch('/api/admin/status')
const isAdmin = computed(() => (adminStatus.value as { isAdmin?: boolean } | null)?.isAdmin === true)

const navLinks = computed(() => [
  { to: '/matches', key: 'nav.matches', icon: 'pi pi-calendar' },
  { to: '/bracket', key: 'nav.bracket', icon: 'pi pi-sitemap' },
  { to: '/map', key: 'nav.map', icon: 'pi pi-map' },
  { to: '/leaderboard', key: 'nav.ranking', icon: 'pi pi-trophy' },
  { to: '/predictions', key: 'nav.myPicks', icon: 'pi pi-check-circle' },
  ...(isAdmin.value ? [{ to: '/admin', key: 'nav.admin', icon: 'pi pi-cog' }] : []),
])

const userMenu = ref()
async function onSignOut() {
  userMenu.value?.hide?.()
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
      <div class="mx-auto max-w-7xl px-4 h-16 flex justify-between md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div class="flex items-center gap-3 min-w-0">
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
            class="max-w-52"
          />
        </div>

        <nav class="hidden md:flex items-center gap-1">
          <NuxtLink
            v-for="l in navLinks"
            :key="l.to"
            :to="l.to"
            class="px-2.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10 whitespace-nowrap"
            active-class="!text-[var(--p-primary-color)] bg-black/5 dark:bg-white/10"
            :title="t(l.key)"
          >
            <i :class="l.icon" /><span class="hidden lg:inline">{{ t(l.key) }}</span>
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-1.5 justify-end">
          <Select v-model="lang" :options="locales" option-label="name" option-value="code" size="small" class="w-[4.5rem]">
            <template #value="{ value }">{{ String(value).toUpperCase() }}</template>
          </Select>

          <Button :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'" text rounded severity="secondary" aria-label="Toggle theme" @click="toggle" />

          <ClientOnly>
            <template v-if="session && session.data">
              <button type="button" class="rounded-full" :aria-label="t('account.title')" @click="(e) => userMenu.toggle(e)">
                <Avatar
                  :label="(session.data.user.name || '?').charAt(0).toUpperCase()"
                  shape="circle"
                  class="!bg-[var(--p-primary-color)] !text-[var(--p-primary-contrast-color)] font-bold cursor-pointer"
                />
              </button>
              <Popover ref="userMenu">
                <div class="flex flex-col w-52 -m-1">
                  <div class="px-3 py-2">
                    <div class="font-semibold text-sm truncate">{{ session.data.user.name }}</div>
                    <div class="text-xs truncate" style="color: var(--p-text-muted-color)">{{ session.data.user.email }}</div>
                  </div>
                  <div class="border-t" style="border-color: var(--p-content-border-color)" />
                  <NuxtLink to="/account" class="px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="userMenu.hide()">
                    <i class="pi pi-user" />{{ t('account.title') }}
                  </NuxtLink>
                  <button type="button" class="px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="onSignOut">
                    <i class="pi pi-sign-out" />{{ t('nav.signOut') }}
                  </button>
                </div>
              </Popover>
            </template>
            <NuxtLink v-else to="/login">
              <Button :label="t('nav.signIn')" size="small" />
            </NuxtLink>
          </ClientOnly>
        </div>
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
