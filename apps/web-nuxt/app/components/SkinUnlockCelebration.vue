<script setup lang="ts">
// One-shot "you found the easter egg" flourish. Driven by useSkin().celebrate,
// which the konami unlock bumps. Client-only (the overlay starts hidden and is
// only ever toggled by the watcher), so there's no SSR/hydration concern.
const { celebrate } = useSkin()
const { t } = useI18n()

const show = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function dismiss() {
  clearTimeout(timer)
  show.value = false
}

watch(celebrate, (n, old) => {
  if (n <= (old ?? 0)) return
  show.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (show.value = false), 5200)
})

onBeforeUnmount(() => clearTimeout(timer))

// Firework confetti: several waves of pieces radiating out from the centre.
// Deterministic (angle/distance derived from the index), so no hydration or
// random-seed concerns; colours sweep the rainbow.
interface Piece {
  dx: number
  dy: number
  hue: number
  delay: number
  dur: number
  rot: number
  big: boolean
}
const PIECES: Piece[] = (() => {
  const out: Piece[] = []
  const waves = 3
  const per = 18
  for (let w = 0; w < waves; w++) {
    for (let i = 0; i < per; i++) {
      const angle = (i / per) * 360 + w * 9
      const rad = (angle * Math.PI) / 180
      const dist = 130 + ((i * 41 + w * 67) % 150)
      out.push({
        dx: Math.round(Math.cos(rad) * dist),
        dy: Math.round(Math.sin(rad) * dist),
        hue: Math.round((angle + w * 50) % 360),
        delay: Number((w * 0.5 + (i % 5) * 0.03).toFixed(2)),
        dur: Number((1.1 + (i % 5) * 0.18).toFixed(2)),
        rot: ((i * 53) % 720) - 360,
        big: i % 6 === 0,
      })
    }
  }
  return out
})()

function pieceStyle(p: Piece) {
  return {
    '--dx': `${p.dx}px`,
    '--dy': `${p.dy}px`,
    '--rot': `${p.rot}deg`,
    '--dur': `${p.dur}s`,
    '--delay': `${p.delay}s`,
    background: `hsl(${p.hue} 90% 60%)`,
  } as Record<string, string>
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ng-pony-fade">
      <div v-if="show" class="ng-pony-celebrate" role="status" aria-live="polite">
        <div class="ng-pony-backdrop" @click="dismiss" />
        <div class="ng-pony-fw" aria-hidden="true">
          <span class="ng-pony-flash" />
          <span
            v-for="(p, i) in PIECES"
            :key="i"
            class="ng-pony-piece"
            :class="{ big: p.big }"
            :style="pieceStyle(p)"
          />
        </div>
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
.ng-pony-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  background: rgba(10, 8, 24, 0.55);
  backdrop-filter: blur(2px);
}

/* firework layer: pieces explode out from the centre point */
.ng-pony-fw {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ng-pony-flash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 260px;
  height: 260px;
  margin: -130px 0 0 -130px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 240, 200, 0.4) 45%, rgba(255, 255, 255, 0) 70%);
  animation: ng-pony-flash 0.75s ease-out forwards;
}
.ng-pony-piece {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 9999px;
  box-shadow: 0 0 6px currentColor;
  animation: ng-pony-burst var(--dur) cubic-bezier(0.15, 0.6, 0.3, 1) var(--delay) both;
}
.ng-pony-piece.big {
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 3px;
}
@keyframes ng-pony-burst {
  0% {
    transform: translate(0, 0) scale(0.2);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(1) rotate(var(--rot));
    opacity: 0;
  }
}
@keyframes ng-pony-flash {
  0% {
    transform: scale(0.1);
    opacity: 0.95;
  }
  100% {
    transform: scale(1.1);
    opacity: 0;
  }
}

.ng-pony-card {
  position: relative;
  z-index: 1;
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
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
  animation: ng-pony-cardpop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes ng-pony-cardpop {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  60% {
    transform: scale(1.04);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
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

/* root fade carries the backdrop dim in/out; the card has its own spring pop */
.ng-pony-fade-enter-active,
.ng-pony-fade-leave-active {
  transition: opacity 0.35s ease;
}
.ng-pony-fade-enter-from,
.ng-pony-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ng-pony-fw {
    display: none;
  }
  .ng-pony-card {
    animation: none;
  }
}
</style>
