<script setup lang="ts">
// Spotlight onboarding tour overlay. Dims the page, cuts a hole around one
// target element at a time, and steps the user through the core actions. Logic
// and state live in useOnboardingTour; this file is the view + the DOM
// geometry. Client-only: it reads window/getBoundingClientRect, so nothing
// renders until mounted.
const { t } = useI18n()
const { active, stepIndex, canAutoStart, steps, start, next, prev, skip } = useOnboardingTour()

const mounted = ref(false)
const rect = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const cardPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })
const cardEl = ref<HTMLElement | null>(null)

const PAD = 8
const GAP = 14
const CARD_W = 320

const step = computed(() => steps[stepIndex.value])
const title = computed(() => t(`onboarding.steps.${step.value.key}.title`))
const body = computed(() => t(`onboarding.steps.${step.value.key}.body`))
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value === steps.length - 1)

let retry = 0
// The id of a pending self-skip retry frame, so unmount can cancel it (a step
// whose target never appears is mid-retry when the overlay tears down).
let rafId = 0

// Resolve the current step's target: find it, scroll it into view, cache its
// rect. A step with no target is a centered card. A step whose target never
// appears (e.g. the chat launcher for a user with no league) is skipped after
// a short grace period rather than stalling the tour.
function locate() {
  if (!active.value) return
  const sel = step.value.target
  if (!sel) {
    rect.value = null
    positionCard()
    return
  }
  const el = document.querySelector(sel) as HTMLElement | null
  const r = el?.getBoundingClientRect()
  // Treat absent or zero-size (v-show hidden, e.g. the chat launcher for a user
  // whose chat is off) as not-there: retry briefly, then skip the step.
  if (!el || !r || (r.width === 0 && r.height === 0)) {
    if (retry++ < 24) rafId = requestAnimationFrame(locate)
    else next()
    return
  }
  retry = 0
  rafId = 0
  const off = r.top < 0 || r.bottom > window.innerHeight
  if (off) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  measure()
}

// Read the live rect and place the card. Called on locate, scroll and resize so
// the spotlight tracks the target through smooth-scroll and layout shifts.
function measure() {
  const sel = step.value.target
  if (!sel) {
    rect.value = null
    positionCard()
    return
  }
  const el = document.querySelector(sel) as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  rect.value = { top: r.top, left: r.left, width: r.width, height: r.height }
  positionCard()
}

function positionCard() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardH = cardEl.value?.offsetHeight ?? 200
  if (!rect.value) {
    cardPos.value = { top: Math.max(12, (vh - cardH) / 2), left: Math.max(12, (vw - CARD_W) / 2) }
    return
  }
  const r = rect.value
  let left = r.left + r.width / 2 - CARD_W / 2
  left = Math.min(Math.max(12, left), vw - CARD_W - 12)
  const below = r.top + r.height + PAD + GAP
  const above = r.top - PAD - GAP - cardH
  let top: number
  if (below + cardH <= vh - 12) top = below
  else if (above >= 12) top = above
  else top = Math.max(12, vh - cardH - 12)
  cardPos.value = { top, left }
}

const holeStyle = computed(() => {
  const r = rect.value
  if (!r) return {}
  return {
    top: `${r.top - PAD}px`,
    left: `${r.left - PAD}px`,
    width: `${r.width + PAD * 2}px`,
    height: `${r.height + PAD * 2}px`,
  }
})

function onResize() {
  measure()
}

watch([active, stepIndex], async () => {
  if (!active.value) return
  retry = 0
  await nextTick()
  locate()
  // Re-place once the card has a real height.
  await nextTick()
  positionCard()
})

watch(canAutoStart, (v) => {
  if (v) void start()
})

function onKey(e: KeyboardEvent) {
  if (!active.value) return
  if (e.key === 'Escape') void skip()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft' && !isFirst.value) prev()
}

onMounted(() => {
  mounted.value = true
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
  window.addEventListener('keydown', onKey)
  if (canAutoStart.value) void start()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
  window.removeEventListener('keydown', onKey)
  // Cancel any pending self-skip frame so it can't run against a torn-down
  // component and mutate the shared tour state after unmount.
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="mounted && active"
      class="fixed inset-0 z-[1000]"
      :class="rect ? '' : 'bg-black/60'"
      role="dialog"
      aria-modal="true"
      :aria-label="t('onboarding.title')"
    >
      <!-- Spotlight cut-out: the huge box-shadow dims everything but the hole. -->
      <div
        v-if="rect"
        class="absolute rounded-xl pointer-events-none transition-all duration-300 ease-out"
        :style="holeStyle"
        style="box-shadow: 0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 2px var(--p-primary-color)"
      />

      <div
        ref="cardEl"
        class="absolute rounded-2xl border shadow-2xl p-5 transition-all duration-300 ease-out"
        :style="{ top: `${cardPos.top}px`, left: `${cardPos.left}px`, width: `${CARD_W}px`, maxWidth: 'calc(100vw - 24px)', background: 'var(--p-content-background)', borderColor: 'var(--p-content-border-color)' }"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-base font-semibold">{{ title }}</h2>
          <span class="text-xs shrink-0" style="color: var(--p-text-muted-color)">
            {{ stepIndex + 1 }} / {{ steps.length }}
          </span>
        </div>
        <p class="text-sm mb-4" style="color: var(--p-text-muted-color)">{{ body }}</p>

        <div class="flex items-center justify-center gap-1.5 mb-4">
          <span
            v-for="(s, i) in steps"
            :key="s.key"
            class="rounded-full transition-all"
            :style="{
              width: i === stepIndex ? '18px' : '6px',
              height: '6px',
              background: i === stepIndex ? 'var(--p-primary-color)' : 'var(--p-content-border-color)',
            }"
          />
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button :label="t('onboarding.skip')" text size="small" @click="skip" />
          <div class="flex items-center gap-2">
            <Button v-if="!isFirst" :label="t('onboarding.back')" severity="secondary" outlined size="small" @click="prev" />
            <Button :label="isLast ? t('onboarding.done') : t('onboarding.next')" size="small" @click="next" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
