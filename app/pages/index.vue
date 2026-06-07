<script setup lang="ts">
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion-v'

const { t } = useI18n()
const { session } = useAuth()
const config = useRuntimeConfig()
const last = useLastCompetition()
const { data: competitions } = useCompetitions()

const authed = computed(() => !!(session && session.data))
const matchesLink = computed(() => `/${last.value}/matches`)

const features = [
  { icon: 'pi pi-bullseye', color: '#6366f1', key: 'scoring' },
  { icon: 'pi pi-star-fill', color: '#f59e0b', key: 'joker' },
  { icon: 'pi pi-trophy', color: '#10b981', key: 'champion' },
  { icon: 'pi pi-bolt', color: '#ef4444', key: 'live' },
  { icon: 'pi pi-sitemap', color: '#8b5cf6', key: 'bracket' },
  { icon: 'pi pi-map', color: '#06b6d4', key: 'map' },
  { icon: 'pi pi-chart-bar', color: '#ec4899', key: 'stats' },
  { icon: 'pi pi-users', color: '#3b82f6', key: 'ranking' },
  { icon: 'pi pi-flag', color: '#22c55e', key: 'competitions' },
]
const tiers = [
  { pts: '3', key: 'exact' },
  { pts: '2', key: 'diff' },
  { pts: '1', key: 'outcome' },
  { pts: '0', key: 'miss' },
]

// Banner journey (Motion for Vue), scrubbed by scroll in two phases:
//   phase 1 (0→SCRUB): screen-centered card over a dimmed page → docked full-bleed strip
//   phase 2 (SCRUB→SCRUB+SCRUB2): the strip shrinks into a slim bar pinned under the header
const SCRUB = 420
const SCRUB2 = 360
const MINI_H = 100
const reduced = useReducedMotion()
const { scrollY } = useScroll()
const spring = { stiffness: 220, damping: 30 }
const t1 = useSpring(useTransform(scrollY, [0, SCRUB], [1, 0]), spring) // 1 = centered
const t2 = useSpring(useTransform(scrollY, [SCRUB, SCRUB + SCRUB2], [0, 1]), spring) // 1 = mini bar
const bWidth = useTransform(t1, (v) => `${(100 - 12 * v).toFixed(2)}vw`)
const bHeight = useTransform([t1, t2] as never, (values: never) => {
  const [a, b] = values as unknown as [number, number]
  const w = 100 - 12 * a
  return `calc(min(${(w * 0.3023).toFixed(2)}vw, 40vh) * ${(1 - b).toFixed(4)} + ${(MINI_H * b).toFixed(1)}px)`
})
const bTransform = useTransform(t1, (v) => `translateX(-50%) translateY(calc(${v.toFixed(4)} * (50vh - 50% - 88px)))`)
const bRadius = useTransform(t1, (v) => `${(30 * v).toFixed(1)}px`)
const bShadow = useTransform([t1, t2] as never, (values: never) => {
  const [a, b] = values as unknown as [number, number]
  return `0 ${(30 * a + 6 * b).toFixed(1)}px ${(90 * a + 18 * b).toFixed(1)}px rgba(8, 6, 24, ${(0.55 * a + 0.35 * b).toFixed(3)})`
})
const dimOpacity = useTransform(t1, (v) => 0.6 * v)
// Phase 2 crossfades the full artwork into a purpose-built compact banner.
const wideOpacity = useTransform(t2, (v) => 1 - v)

// Stars float above the dim during the intro, then settle behind the content.
const starsFront = ref(true)
onMounted(() => {
  t1.on('change', (v) => (starsFront.value = v > 0.04))
})
</script>

<template>
  <div class="flex flex-col gap-20 sm:gap-28 pb-12">
    <StarField :style="{ zIndex: starsFront && !reduced ? 31 : -10 }" />
    <!-- Spacer reserving the docked strip + the phase-1 scroll budget; the banner
         itself is fixed so it can stay pinned (slim) for the whole page. -->
    <div
      class="relative w-screen left-1/2 -translate-x-1/2 -mt-6 -mb-8 sm:-mb-12"
      :style="{ height: reduced ? 'min(30.2vw, 40vh)' : `calc(min(30.2vw, 40vh) + ${SCRUB}px)` }"
    >
      <div v-if="reduced" class="w-screen h-[min(30.2vw,40vh)]">
        <img src="/brand/banner-wide.svg" alt="Nostragoalus - the football oracle" class="w-full h-full object-cover block" >
      </div>
    </div>
    <!-- ClientOnly: motion-v styles SSR'd then re-driven client-side caused a
         hydration mismatch that killed the whole page's interactivity on first load. -->
    <ClientOnly>
      <motion.div
        v-if="!reduced"
        class="fixed left-1/2 top-16 z-40 overflow-hidden"
        :style="{ width: bWidth, height: bHeight, transform: bTransform, borderRadius: bRadius, boxShadow: bShadow, background: '#171436' }"
      >
        <motion.div class="absolute inset-0" :style="{ opacity: t2, background: 'url(/brand/banner-mini.svg) center / cover no-repeat' }" />
        <motion.img src="/brand/banner-wide.svg" alt="Nostragoalus - the football oracle" class="absolute inset-0 w-full h-full object-cover" :style="{ opacity: wideOpacity }" />
      </motion.div>
      <motion.div v-if="!reduced" class="fixed inset-0 z-30 pointer-events-none" :style="{ background: '#0b0a18', opacity: dimOpacity }" />
      <template #fallback>
        <!-- static replica of the t=1 motion state so first paint matches hydration -->
        <div
          class="fixed left-1/2 top-16 z-40 overflow-hidden w-[88vw] rounded-[30px]"
          style="height: min(26.6vw, 40vh); transform: translateX(-50%) translateY(calc(50vh - 50% - 88px)); box-shadow: 0 30px 90px rgba(8, 6, 24, 0.55); background: #171436"
        >
          <img src="/brand/banner-wide.svg" alt="Nostragoalus - the football oracle" class="absolute inset-0 w-full h-full object-cover" >
        </div>
        <div class="fixed inset-0 z-30 pointer-events-none" style="background: #0b0a18; opacity: 0.6" />
      </template>
    </ClientOnly>

    <!-- Hero -->
    <section class="text-center flex flex-col items-center gap-6">
      <div
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
      >
        <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: #22c55e" /> {{ t('landing.badge') }}
      </div>
      <h1 class="text-4xl sm:text-6xl font-extrabold max-w-3xl leading-[1.1]">
        {{ t('landing.heroA') }}
        <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">{{ t('landing.heroB') }}</span>
      </h1>
      <p class="text-lg max-w-xl" style="color: var(--p-text-muted-color)">{{ t('landing.sub') }}</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <NuxtLink :to="authed ? matchesLink : '/signup'">
          <Button :label="authed ? t('home.goToMatches') : t('home.getStarted')" icon="pi pi-arrow-right" icon-pos="right" size="large" />
        </NuxtLink>
        <NuxtLink :to="authed ? matchesLink : '/login'">
          <Button :label="authed ? t('landing.browse') : t('nav.signIn')" size="large" severity="secondary" outlined />
        </NuxtLink>
      </div>
    </section>

    <!-- Features -->
    <section class="flex flex-col gap-10">
      <div class="text-center flex flex-col gap-3">
        <h2 class="text-3xl font-bold">{{ t('landing.featuresTitle') }}</h2>
        <p class="max-w-xl mx-auto" style="color: var(--p-text-muted-color)">{{ t('landing.featuresSub') }}</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="f in features" :key="f.key" class="ng-card rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--p-content-background)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg" :style="`background: color-mix(in srgb, ${f.color} 16%, transparent); color: ${f.color}`">
            <i :class="f.icon" />
          </div>
          <h3 class="font-bold">{{ t(`landing.f.${f.key}.t`) }}</h3>
          <p class="text-sm leading-relaxed" style="color: var(--p-text-muted-color)">{{ t(`landing.f.${f.key}.d`) }}</p>
        </div>
      </div>
    </section>

    <!-- Scoring -->
    <section
      class="rounded-3xl border p-8 sm:p-12 flex flex-col gap-8"
      style="border-color: var(--p-content-border-color); background: color-mix(in srgb, var(--p-primary-color) 7%, var(--p-content-background))"
    >
      <div class="text-center flex flex-col gap-2">
        <h2 class="text-3xl font-bold">{{ t('landing.scoringTitle') }}</h2>
        <p style="color: var(--p-text-muted-color)">{{ t('landing.scoringSub') }}</p>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          v-for="tier in tiers"
          :key="tier.key"
          class="rounded-2xl border p-5 text-center"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <div class="text-4xl font-extrabold tabular-nums" style="color: var(--p-primary-color)">{{ tier.pts }}</div>
          <div class="text-sm font-medium mt-1">{{ t(`landing.tier.${tier.key}`) }}</div>
        </div>
      </div>
      <div class="flex flex-wrap justify-center gap-3 text-sm">
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">✨ {{ t('landing.bonus') }}</span>
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">★ {{ t('landing.jokerPill') }}</span>
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">🏆 {{ t('landing.championPill') }}</span>
      </div>
    </section>

    <!-- Competitions -->
    <section v-if="competitions && competitions.length" class="flex flex-col gap-8">
      <div class="text-center flex flex-col gap-2">
        <h2 class="text-3xl font-bold">{{ t('landing.compsTitle') }}</h2>
        <p style="color: var(--p-text-muted-color)">{{ t('landing.compsSub') }}</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="c in competitions"
          :key="c.slug"
          :to="`/${c.slug}/matches`"
          class="ng-card rounded-2xl border p-5 flex items-center gap-3 transition hover:border-[var(--p-primary-color)]"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <span class="text-2xl">🏆</span>
          <div class="min-w-0">
            <div class="font-bold truncate">{{ c.name }}</div>
            <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('landing.viewComp') }}</div>
          </div>
          <i class="pi pi-arrow-right ml-auto shrink-0" style="color: var(--p-primary-color)" />
        </NuxtLink>
      </div>
    </section>

    <!-- FAQ -->
    <section class="max-w-3xl mx-auto w-full">
      <h2 class="text-3xl font-extrabold text-center mb-2">{{ t('faq.title') }}</h2>
      <p class="text-center mb-8" style="color: var(--p-text-muted-color)">{{ t('faq.sub') }}</p>
      <Accordion>
        <AccordionPanel v-for="i in 8" :key="i" :value="String(i)">
          <AccordionHeader>{{ t(`faq.q${i}.q`) }}</AccordionHeader>
          <AccordionContent><p class="text-sm" style="color: var(--p-text-muted-color)">{{ t(`faq.q${i}.a`) }}</p></AccordionContent>
        </AccordionPanel>
      </Accordion>
    </section>

    <!-- Final CTA -->
    <section class="rounded-3xl p-10 sm:p-16 text-center text-white flex flex-col items-center gap-5" style="background: linear-gradient(135deg, #4f46e5, #10b981)">
      <img src="/brand/mark.svg" alt="" class="w-20" >
      <h2 class="text-3xl sm:text-4xl font-extrabold">{{ t('landing.ctaTitle') }}</h2>
      <p class="max-w-md text-white/90">{{ t('landing.ctaSub') }}</p>
      <NuxtLink :to="authed ? matchesLink : '/signup'">
        <Button :label="authed ? t('home.goToMatches') : t('home.getStarted')" icon="pi pi-arrow-right" icon-pos="right" size="large" severity="contrast" />
      </NuxtLink>
    </section>

    <footer class="text-center text-sm flex flex-col gap-2" style="color: var(--p-text-muted-color)">
      <div>© 2026 {{ config.public.appName }} · {{ t('landing.footer') }} {{ t('footer.builtWith') }}</div>
      <div class="flex justify-center gap-4 text-xs">
        <NuxtLink to="/about" class="hover:underline">{{ t('about.title') }}</NuxtLink>
        <a href="/_docs/api" target="_blank" rel="noopener" class="hover:underline">API</a>
        <span>WTFPL</span>
      </div>
    </footer>
  </div>
</template>
