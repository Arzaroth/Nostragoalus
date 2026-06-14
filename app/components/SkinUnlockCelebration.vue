<script setup lang="ts">
// One-shot "you found the easter egg" flourish. Driven by useSkin().celebrate,
// which the konami unlock bumps. Client-only (the overlay starts hidden and is
// only ever toggled by the watcher), so there's no SSR/hydration concern.
const { celebrate } = useSkin()
const { t } = useI18n()

const show = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(celebrate, (n, old) => {
  if (n <= (old ?? 0)) return
  show.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (show.value = false), 5200)
})

onBeforeUnmount(() => clearTimeout(timer))

// Deterministic per-piece styling: spread the confetti across the width in a
// rainbow, with staggered fall delays.
const HUES = [0, 35, 55, 130, 200, 280, 320]
function confettiStyle(i: number) {
  return {
    left: `${(i * 4.1) % 100}%`,
    background: `hsl(${HUES[i % HUES.length]} 90% 60%)`,
    animationDelay: `${(i % 8) * 0.18}s`,
    animationDuration: `${2.6 + (i % 5) * 0.32}s`,
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ng-pony-pop">
      <div v-if="show" class="ng-pony-celebrate" role="status" aria-live="polite">
        <span v-for="i in 28" :key="i" class="ng-pony-confetti" :style="confettiStyle(i)" />
        <div class="ng-pony-card">
          <div class="ng-pony-spark" aria-hidden="true">🦄 ✨ 🌈</div>
          <p class="ng-pony-title">{{ t('skins.unlockedTitle') }}</p>
          <p class="ng-pony-hint">{{ t('skins.unlockedHint') }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ng-pony-celebrate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
}
.ng-pony-card {
  pointer-events: auto;
  text-align: center;
  padding: 1.5rem 2rem;
  border-radius: 1.25rem;
  background: var(--p-content-background, #fff);
  border: 3px solid transparent;
  background-image:
    linear-gradient(var(--p-content-background, #fff), var(--p-content-background, #fff)),
    linear-gradient(120deg, #ff5d8f, #ffb347, #ffe66d, #6dffb5, #5db8ff, #b56dff);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
}
.ng-pony-spark {
  font-size: 2rem;
  letter-spacing: 0.25rem;
}
.ng-pony-title {
  margin-top: 0.4rem;
  font-weight: 800;
  font-size: 1.25rem;
}
.ng-pony-hint {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #666);
}
.ng-pony-confetti {
  position: absolute;
  top: -5%;
  width: 9px;
  height: 14px;
  border-radius: 2px;
  opacity: 0.9;
  animation-name: ng-pony-fall;
  animation-timing-function: ease-in;
  animation-iteration-count: 1;
}
@keyframes ng-pony-fall {
  0% {
    transform: translateY(-10vh) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(720deg);
    opacity: 0.9;
  }
}
.ng-pony-pop-enter-active {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
}
.ng-pony-pop-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.ng-pony-pop-enter-from,
.ng-pony-pop-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
@media (prefers-reduced-motion: reduce) {
  .ng-pony-confetti {
    display: none;
  }
  .ng-pony-pop-enter-active,
  .ng-pony-pop-leave-active {
    transition: opacity 0.2s ease;
  }
}
</style>
