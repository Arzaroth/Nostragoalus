<script setup lang="ts">
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion-v'

const { t } = useI18n()
const { session } = useAuth()
const config = useRuntimeConfig()
const last = useLastCompetition()
const { data: competitions } = useCompetitions()

const authed = computed(() => !!session.value?.data)
const matchesLink = computed(() => `/${last.value}/matches`)

const features = [
  { icon: 'pi pi-bullseye', color: '#6366f1', key: 'scoring' },
  { icon: 'pi pi-star-fill', color: 'var(--ng-star)', key: 'joker' },
  { icon: 'pi pi-trophy', color: '#10b981', key: 'champion' },
  { icon: 'pi pi-user', color: '#f43f5e', key: 'bestScorer' },
  { icon: 'pi pi-bolt', color: 'var(--ng-danger)', key: 'live' },
  { icon: 'pi pi-shield', color: '#f59e0b', key: 'leagues' },
  { icon: 'pi pi-android', color: '#14b8a6', key: 'bot' },
  { icon: 'pi pi-sitemap', color: '#8b5cf6', key: 'bracket' },
  { icon: 'pi pi-map', color: '#06b6d4', key: 'map' },
  { icon: 'pi pi-chart-bar', color: '#ec4899', key: 'stats' },
  { icon: 'pi pi-users', color: '#3b82f6', key: 'ranking' },
  { icon: 'pi pi-flag', color: 'var(--ng-success)', key: 'competitions' },
]
const tiers = [
  { pts: '3', key: 'exact' },
  { pts: '2', key: 'diff' },
  { pts: '1', key: 'outcome' },
  { pts: '0', key: 'miss' },
]

// Banner journey (Motion for Vue), scrubbed by scroll in two phases, then latched:
//   phase 1 (0→SCRUB): screen-centered card over a dimmed page → docked full-bleed strip
//   phase 2 (SCRUB→SCRUB+PHASE2): the strip shrinks into a slim bar pinned under the header
//   latch: once docked (or the cue is clicked) the bar holds slim until the page
//     scrolls back to the very top - so reading the content never re-expands it,
//     and the slim landing is reliable on any viewport height.
const SCRUB = 420
const PHASE2 = 300
const MINI_H = 100
const reduced = useReducedMotion()
// Latched = intro is done; the bar holds its slim state regardless of scroll.
const latched = ref(false)

// Pinned-bar geometry, derived from the real layout instead of breakpoints:
// - topPx: the bar pins flush under the (one- or two-row) header, measured.
// - miniH: pinned-bar height, slimmer on phones, capped at MINI_H.
const topPx = ref(64)
const miniH = ref(MINI_H)
const heroEl = ref<HTMLElement | null>(null)
function layoutBanner() {
  const vw = window.innerWidth
  const header = document.querySelector('header')
  topPx.value = header ? Math.floor(header.getBoundingClientRect().height) - 1 : 64
  miniH.value = Math.min(MINI_H, Math.round(vw * 0.16))
  layoutTick.set(layoutTick.get() + 1)
  updateArt()
}

const { scrollY } = useScroll()
const spring = { stiffness: 220, damping: 30 }
// The springs overshoot their [0,1] targets while settling; unclamped, that
// overshoot scales with (viewport-sized) geometry - e.g. the bar height swings
// by (40vh - miniH) * overshoot, a visible left-right wobble on big screens.
const cl = (v: number) => Math.min(1, Math.max(0, v))
// While latched the targets pin to the docked state (t1=0, t2=1); otherwise they
// scrub with scroll. The functional form re-reads `latched` on every scroll tick.
const t1 = useSpring(useTransform(scrollY, (v) => (latched.value ? 0 : cl(1 - v / SCRUB))), spring) // 1 = centered
const t2 = useSpring(useTransform(scrollY, (v) => (latched.value ? 1 : cl((v - SCRUB) / PHASE2))), spring) // 1 = mini bar
// Bumped by layoutBanner so px-baked transforms recompute on resize, not only
// on the next scroll.
const layoutTick = useMotionValue(0)
const bWidth = useTransform(t1, (v) => `${(100 - 12 * cl(v)).toFixed(2)}vw`)
const bHeight = useTransform([t1, t2] as never, (values: never) => {
  const [a, b] = (values as unknown as [number, number]).map(cl)
  const w = 100 - 12 * a
  return `calc(min(${(w * 0.3023).toFixed(2)}vw, 40vh) * ${(1 - b).toFixed(4)} + ${(miniH.value * b).toFixed(1)}px)`
})
// The centering constant compensates the bar's resting offset (header height + 24).
const bTransform = useTransform([t1, layoutTick] as never, (values: never) => {
  const [v] = values as unknown as [number, number]
  return `translateX(-50%) translateY(calc(${cl(v).toFixed(4)} * (50vh - 50% - ${topPx.value + 24}px)))`
})
const bRadius = useTransform(t1, (v) => `${(30 * cl(v)).toFixed(1)}px`)
const bShadow = useTransform([t1, t2] as never, (values: never) => {
  const [a, b] = (values as unknown as [number, number]).map(cl)
  return `0 ${(30 * a + 6 * b).toFixed(1)}px ${(90 * a + 18 * b).toFixed(1)}px rgba(8, 6, 24, ${(0.55 * a + 0.35 * b).toFixed(3)})`
})
const dimOpacity = useTransform(t1, (v) => 0.6 * cl(v))
// Scroll cue: viewport-anchored (fixed bottom), so it invites scroll the same
// on every screen height instead of relying on content peeking above the fold.
// Fades out as the banner journey starts; click jumps past the intro.
const cueOpacity = useTransform(t1, (v) => cl(v))
const cuePointer = useTransform(t1, (v) => (cl(v) > 0.15 ? 'auto' : 'none'))
// The cue is an explicit "skip the intro": latch the bar slim right away (so the
// result never depends on hitting a magic scroll depth), then scroll the hero to
// sit just under the slim bar - content-relative, so it lands the same on any
// viewport.
const cueScrolling = ref(false)
function scrollPastIntro() {
  latched.value = true
  // This scroll starts at the top, so it would trip the v<=16 unlatch (below)
  // and cancel the latch before clearing the zone. Guard it until we're past 16.
  cueScrolling.value = true
  const el = heroEl.value
  const heroOffset = el ? el.getBoundingClientRect().top + window.scrollY : SCRUB + PHASE2
  window.scrollTo({ top: Math.max(0, heroOffset - topPx.value - miniH.value - 16), behavior: 'smooth' })
}
// The next-match pill shares this bottom-center slot; hide the cue when it shows.
const ctaVisible = useState('ng-cta-visible', () => false)
// One INLINE artwork for the whole journey (no compact-banner swap - the two
// artworks were composed differently, so any swap read as the title jumping
// sideways). The svg is cover-fit and horizontally centered, so x never
// moves; as the bar shrinks, the artwork itself adapts: the planet scales
// down in place to stay whole inside the visible band, the subtitle fades
// away, and the title nudges down so its cap tops never clip. All knobs are
// pure functions of the visible band height (in svg units), so the journey
// is continuous from the full banner to the slim bar.
const ballScale = ref(1)
const subtitleOp = ref(1)
const titleScale = ref(1)
const titleShift = ref(0)
function updateArt() {
  const a = cl(t1.get())
  const b = cl(t2.get())
  const vw = window.innerWidth
  const barW = ((100 - 12 * a) / 100) * vw
  const base = Math.min(barW * 0.3023, 0.4 * window.innerHeight)
  const h = base * (1 - b) + miniH.value * b
  const s = Math.max(barW / 2752, h / 832)
  const band = h / s
  ballScale.value = Math.min(1, (0.85 * band) / 470)
  subtitleOp.value = cl((band - 500) / 150)
  // Title eases on the SAME curve as the planet (so they settle together, not
  // text-then-planet), but over a gentler range so the docked title stays
  // readable (~0.8) instead of shrinking to the planet's ~0.2.
  titleScale.value = 0.78 + 0.22 * ballScale.value
  titleShift.value = 16 * (1 - band / 832)
}

// Stars float above the dim during the intro, then settle behind the content.
const starsFront = ref(true)
onMounted(() => {
  t1.on('change', (v) => (starsFront.value = v > 0.04))
  t1.on('change', updateArt)
  t2.on('change', updateArt)
  // Latch once the manual scrubber reaches the docked end; release only back at
  // the very top. The wide gap (16 → SCRUB+PHASE2) keeps it from flickering.
  scrollY.on('change', (v) => {
    // A cue scroll sets the latch then drives down from the top; don't let the
    // v<=16 unlatch undo it. Drop the guard once we're clear of the unlatch zone.
    if (cueScrolling.value) {
      if (v > 16) cueScrolling.value = false
      return
    }
    if (v >= SCRUB + PHASE2) latched.value = true
    else if (v <= 16) latched.value = false
  })
  layoutBanner()
  updateArt()
  window.addEventListener('resize', layoutBanner, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('resize', layoutBanner))
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
        class="fixed left-1/2 z-40 overflow-hidden"
        :style="{ top: `${topPx}px`, width: bWidth, height: bHeight, transform: bTransform, borderRadius: bRadius, boxShadow: bShadow, background: '#171436' }"
      >
        <BannerArt :ball-scale="ballScale" :subtitle-opacity="subtitleOp" :title-scale="titleScale" :title-shift="titleShift" />
      </motion.div>
      <motion.div v-if="!reduced" class="fixed inset-0 z-30 pointer-events-none" :style="{ background: '#0b0a18', opacity: dimOpacity }" />
      <motion.button
        v-if="!reduced && !ctaVisible"
        type="button"
        :aria-label="t('landing.scrollCue')"
        class="ng-scroll-cue fixed left-1/2 bottom-6 z-40 flex items-center justify-center w-11 h-11 rounded-full border backdrop-blur-sm"
        :style="{ transform: 'translateX(-50%)', opacity: cueOpacity, pointerEvents: cuePointer, borderColor: 'rgba(255,255,255,0.18)', background: 'color-mix(in srgb, #171436 65%, transparent)', color: '#fff' }"
        @click="scrollPastIntro"
      >
        <i class="pi pi-chevron-down ng-scroll-cue__icon text-lg" />
      </motion.button>
      <template #fallback>
        <!-- static replica of the t=1 motion state so first paint matches
             hydration. BannerArt (a plain SVG, not motion-v) is skin-aware, so
             a skinned banner is already painted on the server - no default ->
             pony pop-in. -->
        <div
          class="fixed left-1/2 top-16 z-40 overflow-hidden w-[88vw] rounded-[30px]"
          style="height: min(26.6vw, 40vh); transform: translateX(-50%) translateY(calc(50vh - 50% - 88px)); box-shadow: 0 30px 90px rgba(8, 6, 24, 0.55); background: #171436"
        >
          <BannerArt :ball-scale="1" :subtitle-opacity="1" :title-scale="1" :title-shift="0" />
        </div>
        <div class="fixed inset-0 z-30 pointer-events-none" style="background: #0b0a18; opacity: 0.6" />
      </template>
    </ClientOnly>

    <!-- Next-match CTA: rides the fullscreen-banner moment, scrolling away
         dismisses it for this fixture (session-scoped). Client-only: depends
         on sessionStorage + "now". -->
    <ClientOnly>
      <NextMatchCta />
    </ClientOnly>

    <!-- Hero -->
    <section ref="heroEl" class="text-center flex flex-col items-center gap-6">
      <div
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
      >
        <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: var(--ng-success)" /> {{ t('landing.badge') }}
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
      <!-- Signed-out social proof; signed-in users get the NextMatchCta pill instead. -->
      <ClientOnly>
        <LandingTeaser v-if="!authed" />
      </ClientOnly>
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
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)"><GoldenBoot /> {{ t('landing.bestScorerPill') }}</span>
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
          <i class="pi pi-arrow-right ms-auto shrink-0" style="color: var(--p-primary-color)" />
        </NuxtLink>
      </div>
    </section>

    <!-- Showcase: real screenshots over the demo league -->
    <section class="max-w-5xl mx-auto w-full">
      <h2 class="text-3xl font-extrabold text-center mb-2">{{ t('landing.showcaseTitle') }}</h2>
      <p class="text-center mb-8" style="color: var(--p-text-muted-color)">{{ t('landing.showcaseSub') }}</p>
      <Carousel
        :value="['fixtures', 'match', 'ranking', 'bot', 'leagues', 'bracket', 'map', 'team']"
        :num-visible="1"
        :num-scroll="1"
        circular
        :autoplay-interval="5000"
        :show-indicators="true"
      >
        <template #item="{ data: shot }">
          <div class="px-2 sm:px-10 pb-2">
            <div class="rounded-xl overflow-hidden border shadow-xl" style="border-color: var(--p-content-border-color)">
              <div class="flex items-center gap-1.5 px-3 py-2" style="background: var(--p-content-background); border-bottom: 1px solid var(--p-content-border-color)">
                <span class="w-2.5 h-2.5 rounded-full" style="background: #f87171" /><span class="w-2.5 h-2.5 rounded-full" style="background: #fbbf24" /><span class="w-2.5 h-2.5 rounded-full" style="background: #34d399" />
                <span class="ms-2 text-xs font-semibold">{{ t(`landing.shot.${shot}.t`) }}</span>
              </div>
              <!-- Fixed aspect so every slide is the same height (no gap before
                   the caption); the content shots fill it exactly, the wide
                   bracket letterboxes onto the card background. Light/dark are
                   swapped by the `.app-dark` class (set before hydration), not a
                   JS ref - so the right one shows on first paint. -->
              <div class="aspect-[1380/1050] flex items-center justify-center" style="background: var(--p-content-background)">
                <img :src="`/showcase/${shot}.png`" :alt="t(`landing.shot.${shot}.t`)" class="w-full h-full object-contain block dark:hidden" loading="lazy" >
                <img :src="`/showcase/dark/${shot}.png`" :alt="t(`landing.shot.${shot}.t`)" class="w-full h-full object-contain hidden dark:block" loading="lazy" >
              </div>
            </div>
            <p class="text-sm text-center mt-3 max-w-2xl mx-auto" style="color: var(--p-text-muted-color)">{{ t(`landing.shot.${shot}.d`) }}</p>
          </div>
        </template>
      </Carousel>
    </section>

    <!-- FAQ -->
    <section class="max-w-3xl mx-auto w-full">
      <h2 class="text-3xl font-extrabold text-center mb-2">{{ t('faq.title') }}</h2>
      <p class="text-center mb-8" style="color: var(--p-text-muted-color)">{{ t('faq.sub') }}</p>
      <Accordion>
        <AccordionPanel v-for="i in 11" :key="i" :value="String(i)">
          <AccordionHeader>{{ t(`faq.q${i}.q`) }}</AccordionHeader>
          <AccordionContent><p class="text-sm" style="color: var(--p-text-muted-color)">{{ t(`faq.q${i}.a`) }}</p></AccordionContent>
        </AccordionPanel>
        <AccordionPanel value="formula">
          <AccordionHeader>{{ t('faq.formula.q') }}</AccordionHeader>
          <AccordionContent>
            <p class="text-sm mb-3" style="color: var(--p-text-muted-color)">{{ t('faq.formula.a') }}</p>
            <pre class="text-xs overflow-x-auto rounded-lg border p-4 leading-relaxed" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">{{ t('faq.formula.code') }}</pre>
            <p class="text-xs mt-3" style="color: var(--p-text-muted-color)">{{ t('faq.formula.example') }}</p>
          </AccordionContent>
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

    <AppFooter />
  </div>
</template>

<style scoped>
.ng-scroll-cue__icon {
  animation: ng-cue-bob 1.6s ease-in-out infinite;
}
.ng-scroll-cue:hover {
  background: color-mix(in srgb, #171436 85%, transparent) !important;
}
@keyframes ng-cue-bob {
  0%, 100% { transform: translateY(-3px); }
  50% { transform: translateY(3px); }
}
@media (prefers-reduced-motion: reduce) {
  .ng-scroll-cue__icon { animation: none; }
}
</style>
