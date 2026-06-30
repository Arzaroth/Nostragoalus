<script setup lang="ts">
const { session, signOut } = useAuth()
const { t } = useI18n()

// Start the shared presence socket app-wide (always-mounted layout), so we report
// our own online/idle state and receive others' even on pages with no avatar.
usePresence()

// Expose the sticky header's (variable, taller on mobile) height as a CSS var
// so page-level sticky bars can pin right below it.
const headerEl = ref<HTMLElement | null>(null)
useResizeObserver(headerEl, ([entry]) => {
  document.documentElement.style.setProperty('--ng-header-h', `${entry.target.clientHeight}px`)
})
const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()

// With an MLP skin on, hovering the wordmark magically reveals the "My Little
// Prono" name (for the session - it replays on the next reload).
const { skin, pronoRevealed, revealProno } = useSkin()
const showProno = computed(() => !!skin.value && pronoRevealed.value)
const brandName = computed(() => (showProno.value ? t('skins.brand') : config.public.appName))
const brandMagic = ref(false)
function revealBrand() {
  if (!skin.value || pronoRevealed.value) return
  revealProno()
  brandMagic.value = true
  setTimeout(() => (brandMagic.value = false), 900)
}
// A burst of rainbow particles radiating out from the wordmark on reveal.
const BRAND_PARTICLES = 16
function particleStyle(i: number) {
  const ang = (i / BRAND_PARTICLES) * 360
  const rad = (ang * Math.PI) / 180
  const dist = 32 + (i % 4) * 13
  return {
    '--dx': `${Math.round(Math.cos(rad) * dist)}px`,
    '--dy': `${Math.round(Math.sin(rad) * dist)}px`,
    background: `hsl(${Math.round((ang + 15) % 360)} 95% 62%)`,
    animationDelay: `${(i % 3) * 0.05}s`,
  } as Record<string, string>
}

const slug = useSelectedCompetition()
const last = useLastCompetition()
// Remember the competition you're browsing so "/" and legacy links return to it.
watch(
  () => route.params.competition,
  (c) => {
    if (c) last.value = c as string
  },
  { immediate: true },
)

const { data: adminStatus, refresh: refreshAdminStatus } = useFetch('/api/admin/status')
// The admin flag must follow sign-in/out without a hard refresh.
watch(
  () => session.value?.data?.user?.id,
  () => refreshAdminStatus(),
)
const isAdmin = computed(() => (adminStatus.value as { isAdmin?: boolean } | null)?.isAdmin === true)

// Changelog "since last seen": badge the menu when a newer version shipped, and
// silently baseline a signed-in user with no marker yet (so the badge fires on
// the next release, not the whole back catalogue).
const { hasUnseen: hasUnseenChangelog, ensureBaseline: baselineChangelog } = useChangelog()
watch(
  () => session.value?.data?.user?.id,
  (id) => {
    if (id && import.meta.client) void baselineChangelog()
  },
  { immediate: true },
)

const navLinks = computed(() => {
  const c = slug.value
  return [
    { to: `/${c}/matches`, key: 'nav.matches', icon: 'pi pi-calendar' },
    { to: `/${c}/bracket`, key: 'nav.bracket', icon: 'pi pi-sitemap' },
    { to: `/${c}/map`, key: 'nav.map', icon: 'pi pi-map' },
    { to: `/${c}/leaderboard`, key: 'nav.ranking', icon: 'pi pi-trophy' },
    ...(isAdmin.value ? [{ to: '/admin', key: 'nav.admin', icon: 'pi pi-cog' }] : []),
  ]
})

const userMenu = ref()
const { onShow: onUserMenuShow, onHide: onUserMenuHide } = useHideOnScroll(userMenu)
async function onSignOut() {
  userMenu.value?.hide?.()
  await signOut()
  await router.push('/login')
}

// Mobile nav scrolls horizontally; edge fades signal there's more, and the
// active link is brought into view so the current section is never off-screen.
const mnav = ref<HTMLElement | null>(null)
const fadeL = ref(false)
const fadeR = ref(false)
function updateNavFades() {
  const el = mnav.value
  if (!el) return
  fadeL.value = el.scrollLeft > 4
  fadeR.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
function scrollActiveNavIntoView() {
  const el = mnav.value?.querySelector<HTMLElement>('.router-link-active')
  el?.scrollIntoView({ inline: 'center', block: 'nearest' })
}
watch([() => route.path, navLinks], async () => {
  await nextTick()
  scrollActiveNavIntoView()
  updateNavFades()
})
onMounted(() => {
  updateNavFades()
  scrollActiveNavIntoView()
  window.addEventListener('resize', updateNavFades, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('resize', updateNavFades))
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header
      ref="headerEl"
      class="sticky top-0 z-50 backdrop-blur-md border-b"
      style="background: color-mix(in srgb, var(--p-content-background) 82%, transparent); border-color: var(--p-content-border-color)"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex justify-between md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div class="flex items-center min-w-0">
          <NuxtLink to="/" class="logo-home flex items-center gap-2 font-extrabold text-lg shrink-0">
            <LogoMark class="h-12 w-auto shrink-0" />
            <span class="ng-brand-wrap">
              <span
                v-tooltip.bottom="skin ? t('skins.brandTip') : ''"
                class="ng-brand bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent"
                :class="{ 'ng-brand--prono': showProno, 'ng-brand--magic': brandMagic }"
                @mouseenter="revealBrand"
              >{{ brandName }}</span>
              <span v-if="brandMagic" class="ng-brand-burst" aria-hidden="true">
                <i v-for="i in BRAND_PARTICLES" :key="i" class="ng-brand-particle" :style="particleStyle(i)" />
              </span>
            </span>
          </NuxtLink>
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

        <div class="flex items-center gap-2 justify-end">
          <ClientOnly>
            <template v-if="session && session.data">
              <NotificationBell />
              <button type="button" class="relative rounded-full shrink-0" :aria-label="hasUnseenChangelog ? t('nav.whatsNewUnread') : t('account.title')" @click="(e) => userMenu.toggle(e)">
                <Avatar
                  :image="session.data.user.image || '/brand/avatar.svg'"
                  shape="circle"
                  class="cursor-pointer overflow-hidden"
                />
                <span
                  v-if="hasUnseenChangelog"
                  class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--p-content-background)]"
                  style="background: var(--p-primary-color)"
                  aria-hidden="true"
                />
              </button>
              <Popover ref="userMenu" @show="onUserMenuShow" @hide="onUserMenuHide">
                <div class="flex flex-col w-52 -m-1">
                  <div class="px-3 py-2">
                    <div class="font-semibold text-sm truncate">{{ session.data.user.name }}</div>
                    <div class="text-xs truncate" style="color: var(--p-text-muted-color)">{{ session.data.user.email }}</div>
                  </div>
                  <div class="border-t" style="border-color: var(--p-content-border-color)" />
                  <NuxtLink to="/account" class="px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="userMenu.hide()">
                    <i class="pi pi-user" />{{ t('account.title') }}
                  </NuxtLink>
                  <NuxtLink to="/leagues" class="px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="userMenu.hide()">
                    <i class="pi pi-users" />{{ t('leagues.title') }}
                  </NuxtLink>
                  <NuxtLink to="/preferences" class="px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="userMenu.hide()">
                    <i class="pi pi-sliders-h" />{{ t('prefs.title') }}
                  </NuxtLink>
                  <NuxtLink to="/about#changelog" class="px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="userMenu.hide()">
                    <i class="pi pi-megaphone" /><span class="flex-1">{{ t('nav.whatsNew') }}</span>
                    <span v-if="hasUnseenChangelog" class="w-2 h-2 rounded-full shrink-0" style="background: var(--p-primary-color)" aria-hidden="true" />
                  </NuxtLink>
                  <button type="button" class="px-3 py-2 text-sm text-start flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10" @click="onSignOut">
                    <i class="pi pi-sign-out" />{{ t('nav.signOut') }}
                  </button>
                </div>
              </Popover>
            </template>
            <NuxtLink v-else to="/login">
              <Button :label="t('nav.signIn')" size="small" />
            </NuxtLink>
            <LeagueOnboardingDialog v-if="session && session.data" />
          </ClientOnly>
        </div>
      </div>

      <div class="md:hidden relative">
        <nav ref="mnav" class="flex items-center gap-2 px-4 pb-2 overflow-x-auto text-sm" @scroll.passive="updateNavFades">
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
        <div
          v-if="fadeL"
          class="pointer-events-none absolute inset-y-0 left-0 w-8"
          style="background: linear-gradient(to right, var(--p-content-background), transparent)"
        />
        <div
          v-if="fadeR"
          class="pointer-events-none absolute inset-y-0 right-0 w-8"
          style="background: linear-gradient(to left, var(--p-content-background), transparent)"
        />
      </div>
    </header>

    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <slot />
    </main>

    <SiteFooter />
    <Toast />
    <ChatDock />
  </div>
</template>

<style scoped>
.ng-brand-wrap {
  position: relative;
  display: inline-block;
}
.ng-brand {
  display: inline-block;
  position: relative;
}
/* particle explosion radiating from the wordmark on reveal */
.ng-brand-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  pointer-events: none;
}
.ng-brand-particle {
  position: absolute;
  left: 0;
  top: 0;
  width: 7px;
  height: 7px;
  margin: -3.5px;
  border-radius: 9999px;
  box-shadow: 0 0 7px rgba(255, 255, 255, 0.6);
  animation: ng-brand-particle 0.75s cubic-bezier(0.15, 0.6, 0.3, 1) both;
}
@keyframes ng-brand-particle {
  0% {
    transform: translate(0, 0) scale(0.3);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(1);
    opacity: 0;
  }
}
/* Revealed "My Little Prono": rainbow magic gradient (overrides the indigo->
   emerald utility via the higher-specificity scoped selector) that shimmers. */
.ng-brand--prono {
  background-image: linear-gradient(90deg, #ff5d8f, #ffb347, #ffe66d, #6dffb5, #5db8ff, #b56dff, #ff5d8f);
  background-size: 200% auto;
  animation: ng-brand-shimmer 7s linear infinite;
}
@keyframes ng-brand-shimmer {
  to {
    background-position: 200% center;
  }
}
/* one-shot magic pop the moment it reveals */
.ng-brand--magic {
  animation: ng-brand-shimmer 7s linear infinite, ng-brand-pop 0.8s ease;
}
@keyframes ng-brand-pop {
  0% {
    filter: blur(5px) brightness(2.2);
    transform: scale(1.14);
    opacity: 0.35;
  }
  45% {
    filter: blur(0) brightness(1.5);
    transform: scale(1.04);
  }
  100% {
    filter: none;
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ng-brand--prono,
  .ng-brand--magic {
    animation: none;
  }
  .ng-brand-burst {
    display: none;
  }
}
</style>
