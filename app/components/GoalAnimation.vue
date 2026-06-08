<script setup lang="ts">
// Pixel-art first-person goal, contributed art. One loop is 3s; the parent
// decides when to show/hide. Honors reduced-motion by simply not animating.
const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0

onMounted(() => {
  const c = canvas.value
  if (!c || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const x = c.getContext('2d')!
  x.imageSmoothingEnabled = false
  const W = 200
  const H = 112
  const stars = [[16, 14], [36, 22], [58, 10], [78, 28], [96, 16], [120, 30], [134, 12], [150, 26], [168, 10], [186, 22], [26, 36], [70, 38], [176, 34], [10, 30], [44, 12], [112, 8]]
  const sp = stars.map((s, i) => ({ x: s[0], y: s[1], p: i * 0.7, a: 0.5 + (0.4 * ((i * 37) % 5)) / 5 }))
  let trail: [number, number, number][] = []
  const px = (a: number, b: number, w: number, h: number, col: string) => {
    x.fillStyle = col
    x.fillRect(a | 0, b | 0, w, h)
  }
  const disc = (cx: number, cy: number, rad: number, col: string) => {
    x.fillStyle = col
    rad = Math.max(0, rad | 0)
    cx |= 0
    cy |= 0
    for (let dy = -rad; dy <= rad; dy++) {
      const ww = Math.floor(Math.sqrt(rad * rad - dy * dy + 0.25))
      x.fillRect(cx - ww, cy + dy, ww * 2 + 1, 1)
    }
  }
  const line = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    x0 |= 0
    y0 |= 0
    x1 |= 0
    y1 |= 0
    x.fillStyle = col
    const dx = Math.abs(x1 - x0)
    const sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0)
    const sy = y0 < y1 ? 1 : -1
    let e = dx + dy
    for (;;) {
      x.fillRect(x0, y0, 1, 1)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * e
      if (e2 >= dy) {
        e += dy
        x0 += sx
      }
      if (e2 <= dx) {
        e += dx
        y0 += sy
      }
    }
  }
  function scene(t: number, flashA: number) {
    x.fillStyle = '#191338'
    x.fillRect(0, 0, W, 42)
    x.fillStyle = '#23204a'
    x.fillRect(0, 40, W, 4)
    x.fillStyle = '#14182e'
    x.fillRect(0, 42, W, H - 42)
    for (const s of sp) {
      if (s.y < 39) {
        x.globalAlpha = Math.max(0, s.a * (0.55 + 0.45 * Math.sin(t / 420 + s.p)))
        px(s.x, s.y, 1, 1, '#d8ccff')
      }
    }
    x.globalAlpha = 1
    line(0, 111, 100, 42, '#2c285a')
    line(199, 111, 100, 42, '#2c285a')
    line(100, 111, 100, 42, '#221d4c')
    line(50, 111, 93, 42, '#221d4c')
    line(150, 111, 107, 42, '#221d4c')
    for (const yy of [80, 98]) {
      const k = (111 - yy) / 69
      const xl = Math.round(100 * k)
      const xr = Math.round(199 - 99 * k)
      line(xl, yy, xr, yy, '#221d48')
    }
    line(70, 72, 130, 72, '#2a2556')
    line(60, 88, 140, 88, '#2a2556')
    line(70, 72, 60, 88, '#2a2556')
    line(130, 72, 140, 88, '#2a2556')
    px(99, 92, 2, 1, '#3a3470')
    x.fillStyle = `rgba(200,190,245,${0.14 + flashA * 0.55})`
    for (let gx = 72; gx < 130; gx += 4) x.fillRect(gx, 53, 1, 19)
    for (let gy = 55; gy < 72; gy += 4) x.fillRect(71, gy, 59, 1)
    px(70, 52, 1, 21, '#dcd2ff')
    px(130, 52, 1, 21, '#dcd2ff')
    px(70, 52, 61, 1, '#dcd2ff')
    px(86, 107, 28, 5, '#33285e')
    px(88, 105, 24, 3, '#463a86')
    px(95, 104, 11, 2, '#5e4fbf')
  }
  function ball(cx: number, cy: number, r: number, phi: number) {
    disc(cx, cy, r + 2, 'rgba(160,138,240,0.22)')
    disc(cx, cy, r, '#b3a2f0')
    disc(cx - Math.floor(r / 3), cy - Math.floor(r / 3), Math.max(1, r - 1), '#cdbfff')
    const M = [[-0.4, 0.0], [0.35, 1.9], [0.55, 3.6], [-0.12, 5.0]]
    for (const m of M) {
      const a = phi + m[1]
      const ca = Math.cos(a)
      if (ca > 0.12) {
        const sa = Math.sin(a)
        const xs = Math.sqrt(Math.max(0, 1 - sa * sa))
        const mx = Math.round(cx + m[0] * r * xs)
        const my = Math.round(cy + sa * r * 0.92)
        const sz = r >= 6 && ca > 0.6 ? 2 : 1
        px(mx, my, sz, sz, '#332a60')
      }
    }
    if (r >= 2) px(cx - Math.ceil(r / 2), cy - Math.ceil(r / 2), 1, 1, '#ffffff')
  }
  function draw(t: number) {
    const tc = t % 3000
    const flashA = tc >= 2100 && tc < 2360 ? (1 - (tc - 2100) / 260) * 0.6 : 0
    scene(t, flashA)
    let bx: number, by: number, r: number
    if (tc < 2100) {
      const p = tc / 2100
      const ease = 1 - Math.pow(1 - p, 2)
      const env = Math.sin(Math.PI * p)
      const amp = env * 24
      const loft = env * 14
      const ang = p * Math.PI * 2 * 3
      bx = 100 + Math.cos(ang) * amp
      by = 96 - 38 * ease - loft + Math.sin(ang) * amp * 0.6
      r = Math.max(2, Math.round(8 * (1 - 0.5 * ease)))
    } else {
      bx = 101 + Math.sin(t / 90) * 0.6
      by = 58
      r = 4
    }
    const rbx = Math.round(bx)
    const rby = Math.round(by)
    if (tc < 2100) {
      trail.push([rbx, rby, r])
      if (trail.length > 34) trail.shift()
    }
    if (tc < 60) trail = []
    for (let i = 0; i < trail.length; i++) {
      const a = ((i + 1) / trail.length) * 0.5
      disc(trail[i][0], trail[i][1], Math.max(1, Math.round(trail[i][2] * 0.5)), `rgba(205,191,255,${a})`)
    }
    if (tc < 150) {
      x.globalAlpha = (1 - tc / 150) * 0.6
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * 6.283
        const d = (tc / 150) * 9
        px(100 + Math.cos(ang) * d, 95 + Math.sin(ang) * d * 0.6, 1, 1, '#d8ccff')
      }
      x.globalAlpha = 1
    }
    ball(rbx, rby, r, t * 0.016)
    if (tc >= 2100 && tc < 2700) {
      const age = (tc - 2100) / 600
      for (let i = 0; i < 13; i++) {
        const ang = (i / 13) * 6.283
        const d = age * (7 + (i % 4) * 4)
        x.globalAlpha = Math.max(0, 1 - age)
        px(101 + Math.cos(ang) * d, 56 + Math.sin(ang) * d, 1, 1, i % 2 ? '#ffffff' : '#d8ccff')
      }
      x.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas ref="canvas" width="200" height="112" class="goal-canvas" />
</template>

<style scoped>
.goal-canvas {
  display: block;
  width: 320px;
  max-width: 80vw;
  height: auto;
  image-rendering: pixelated;
  border-radius: 14px;
  box-shadow: 0 10px 44px rgba(120, 90, 220, 0.28);
}
</style>
