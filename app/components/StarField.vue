<script setup lang="ts">
// Ambient animated starfield (canvas) behind the landing page - echoes the
// brand artwork. Twinkle + slow upward drift; stars lean gently toward the
// cursor (the oracle senses you); static frame under reduced motion.
// Plain component (NOT .client): the async client-only wrapper fails to mount on
// initial page load; SSR just emits an empty <canvas>, all work happens onMounted.
const props = withDefaults(defineProps<{ density?: number }>(), { density: 150 })

const canvas = ref<HTMLCanvasElement>()
const { x: mouseX, y: mouseY } = useMouse({ type: 'client' })
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
    lx: number
    ly: number
    lb: number
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
      lx: 0,
      ly: 0,
      lb: 0,
    }))
  }

  // Gravitational lens around the pointer: stars within the radius lean
  // toward it (eased), brighten slightly, and spring back when it leaves.
  const LENS_R = 180
  const LENS_PULL = 22

  function draw(ts: number, animate: boolean) {
    ctx!.clearRect(0, 0, w, h)
    const dark = document.documentElement.classList.contains('app-dark')
    const mx = mouseX.value
    const my = mouseY.value
    for (const s of stars) {
      let ox = 0
      let oy = 0
      let boost = 0
      if (animate && mx >= 0 && my >= 0) {
        const dx = mx - s.x
        const dy = my - s.y
        const d = Math.hypot(dx, dy)
        if (d < LENS_R && d > 0.001) {
          const f = (1 - d / LENS_R) ** 2
          ox = (dx / d) * f * LENS_PULL
          oy = (dy / d) * f * LENS_PULL
          boost = f * 0.5
        }
      }
      // ease the rendered offset so entry/exit feels springy, not snappy
      s.lx += (ox - s.lx) * 0.08
      s.ly += (oy - s.ly) * 0.08
      s.lb += (boost - s.lb) * 0.08
      const twinkle = animate ? Math.abs(Math.sin(s.ph + (ts / 1000) * s.tw)) : 0.7
      ctx!.globalAlpha = Math.min(1, (0.2 + 0.8 * twinkle) * (dark ? 0.85 : 0.5) + s.lb)
      ctx!.fillStyle = s.gold ? '#f4d488' : dark ? '#cfd0ff' : '#6a5ace'
      ctx!.beginPath()
      ctx!.arc(s.x + s.lx, s.y + s.ly, s.r + s.lb, 0, Math.PI * 2)
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
