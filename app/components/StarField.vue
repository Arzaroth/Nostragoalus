<script setup lang="ts">
// Ambient animated starfield (canvas) behind the landing page - echoes the
// brand artwork. Twinkle + slow upward drift; static frame under reduced motion.
// Plain component (NOT .client): the async client-only wrapper fails to mount on
// initial page load; SSR just emits an empty <canvas>, all work happens onMounted.
const props = withDefaults(defineProps<{ density?: number }>(), { density: 150 })

const canvas = ref<HTMLCanvasElement>()
let raf = 0
let cleanup: (() => void) | undefined

onMounted(() => {
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let w = 0
  let h = 0

  interface Star {
    x: number
    y: number
    r: number
    tw: number
    ph: number
    vy: number
    gold: boolean
  }
  let stars: Star[] = []

  function resize() {
    w = window.innerWidth
    h = window.innerHeight
    c!.width = w * dpr
    c!.height = h * dpr
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    stars = Array.from({ length: props.density }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.4 + Math.random() * 1.5,
      tw: 0.4 + Math.random() * 1.4,
      ph: Math.random() * Math.PI * 2,
      vy: 0.02 + Math.random() * 0.06,
      gold: Math.random() < 0.12,
    }))
  }

  function draw(ts: number, animate: boolean) {
    ctx!.clearRect(0, 0, w, h)
    const dark = document.documentElement.classList.contains('app-dark')
    for (const s of stars) {
      const twinkle = animate ? Math.abs(Math.sin(s.ph + (ts / 1000) * s.tw)) : 0.7
      ctx!.globalAlpha = (0.2 + 0.8 * twinkle) * (dark ? 0.85 : 0.5)
      ctx!.fillStyle = s.gold ? '#f4d488' : dark ? '#cfd0ff' : '#6a5ace'
      ctx!.beginPath()
      ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx!.fill()
      if (animate) {
        s.y -= s.vy
        if (s.y < -2) {
          s.y = h + 2
          s.x = Math.random() * w
        }
      }
    }
  }

  function frame(ts: number) {
    draw(ts, true)
    raf = requestAnimationFrame(frame)
  }

  resize()
  window.addEventListener('resize', resize)
  if (reduced) draw(0, false)
  else raf = requestAnimationFrame(frame)

  cleanup = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <canvas ref="canvas" class="fixed inset-0 -z-10 pointer-events-none" />
</template>
