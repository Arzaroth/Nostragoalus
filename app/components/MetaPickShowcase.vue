<script setup lang="ts">
// The crowned/boot showcase shared by the champion and best-scorer pickers: a
// holographic 16x16 frame that tilts toward the cursor with a light sweep, an
// emblem, and an empty dashed state. The image, link target, emblem and caption
// are per-feature (team flag + crown vs player photo + golden boot), passed in;
// the frame, the holo math and the empty state are identical, so they live here.
defineProps<{ present: boolean; imageUrl: string | null; linkTo: string | null }>()
defineEmits<{ imageError: [] }>()
const NuxtLinkC = resolveComponent('NuxtLink')

const showcaseEl = ref<HTMLElement | null>(null)
const { elementX, elementY, elementWidth, elementHeight, isOutside } = useMouseInElement(showcaseEl)
const holo = computed(() => {
  if (isOutside.value || !elementWidth.value) return { transform: '', sheen: 0, sx: 50, sy: 50 }
  const px = elementX.value / elementWidth.value
  const py = elementY.value / elementHeight.value
  return {
    transform: `perspective(420px) rotateY(${(px - 0.5) * 22}deg) rotateX(${(0.5 - py) * 22}deg) scale(1.06)`,
    sheen: 1,
    sx: px * 100,
    sy: py * 100,
  }
})
</script>

<template>
  <div class="shrink-0 flex flex-col items-center gap-2 self-center sm:self-start sm:pe-2">
    <component :is="linkTo ? NuxtLinkC : 'div'" :to="linkTo || undefined" class="relative mt-1 block" :class="{ 'hover:opacity-90': linkTo }">
      <template v-if="present">
        <div
          class="absolute -inset-4 rounded-full blur-xl pointer-events-none"
          style="background: radial-gradient(circle, rgba(245, 179, 1, 0.4), transparent 70%)"
        />
        <span
          class="absolute -top-3 -left-3 text-2xl z-10 select-none"
          style="transform: rotate(-25deg); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))"
        ><slot name="emblem" /></span>
        <span ref="showcaseEl" class="relative block w-16 h-16 rounded-2xl" style="transition: transform 0.25s ease" :style="{ transform: holo.transform }">
          <img
            v-if="imageUrl"
            :src="imageUrl"
            class="relative w-16 h-16 rounded-2xl object-cover"
            style="box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.6), 0 10px 24px rgba(0, 0, 0, 0.3)"
            alt=""
            @error="$emit('imageError')"
          >
          <span
            class="absolute inset-0 rounded-2xl pointer-events-none"
            style="transition: opacity 0.25s ease; mix-blend-mode: screen"
            :style="{
              opacity: holo.sheen * 0.75,
              background: `radial-gradient(140px circle at ${holo.sx}% ${holo.sy}%, rgba(255,255,255,0.55), rgba(245,179,1,0.18) 45%, transparent 70%)`,
            }"
          />
        </span>
      </template>
      <template v-else>
        <span class="absolute -top-3 -left-3 text-2xl z-10 opacity-30 grayscale select-none" style="transform: rotate(-25deg)"><slot name="emblem" /></span>
        <div
          class="w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center text-2xl"
          style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
        >?</div>
      </template>
    </component>
    <div class="text-center w-24">
      <slot name="caption" />
    </div>
  </div>
</template>
