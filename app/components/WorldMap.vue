<script setup lang="ts">
import type * as Leaflet from 'leaflet'
import { COUNTRY_CENTROIDS as COORDS } from '../utils/country-centroids'
import { leanColor } from '../utils/crowd-lean'

// A regular (SSR-hydrated) component, NOT a .client one: a .client component's
// template ref stays null in onMounted in the prod/SSR build, so L.map() never
// ran and the map came up blank. Leaflet touches `window` at import, so it is
// imported dynamically inside onMounted (client-only) instead of at module top.

const { t } = useI18n()
const props = defineProps<{
  teams: { code: string; name: string }[]
  // Optional per-team crowd lean in [-1, 1]; tints each flag's ring. Absent = the
  // plain white-ringed map.
  teamLean?: Record<string, number>
}>()
const emit = defineEmits<{ select: [team: { code: string; name: string }] }>()

const hasLean = computed(() => !!props.teamLean && Object.keys(props.teamLean).length > 0)

const el = ref<HTMLElement>()
let L: typeof Leaflet | null = null
let map: Leaflet.Map | null = null
let markers: Leaflet.LayerGroup | null = null
// Keyed so a lean change can re-tint rings in place instead of tearing down and
// rebuilding every marker (a live match patches crowd totals frequently).
let markerByCode: Record<string, Leaflet.Marker> = {}

function ringShadow(code: string): string {
  const lean = props.teamLean?.[code]
  // No lean (overlay off / no data): the plain white-ringed marker.
  if (lean === undefined) return '0 0 0 2px #fff, 0 2px 6px rgba(0, 0, 0, 0.35)'
  // Lean: a white separator, a thick colour band, and a soft glow of the same
  // colour so the tint is legible against neighbouring flags.
  const c = leanColor(lean)
  return `0 0 0 2px #fff, 0 0 0 5px ${c}, 0 0 11px 3px ${c}`
}

function drawMarkers() {
  if (!map || !L) return
  if (!markers) markers = L.layerGroup().addTo(map)
  markers.clearLayers()
  markerByCode = {}
  for (const team of props.teams) {
    const coord = COORDS[team.code]
    if (!coord) continue
    const icon = L.divIcon({
      className: 'ng-flag-marker',
      html: `<img src="https://api.fifa.com/api/v3/picture/flags-sq-3/${team.code}" alt="" style="box-shadow: ${ringShadow(team.code)}" />`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    const marker = L.marker(coord, { icon, title: team.name })
      .on('click', () => {
        emit('select', team)
        centerOn(team.code)
      })
      .addTo(markers)
    markerByCode[team.code] = marker
  }
}

// Re-tint existing markers' rings without rebuilding them - only the box-shadow
// changes, so the flag <img> and click handlers stay put (no flicker).
function retintMarkers() {
  for (const [code, marker] of Object.entries(markerByCode)) {
    const img = marker.getElement()?.querySelector('img')
    if (img) (img as HTMLElement).style.boxShadow = ringShadow(code)
  }
}

function centerOn(code: string) {
  const coord = COORDS[code]
  if (map && coord) map.flyTo(coord, Math.max(map.getZoom(), 4), { duration: 0.8 })
}
defineExpose({ centerOn })

onMounted(async () => {
  if (!el.value) return
  const mod = await import('leaflet')
  L = mod.default ?? (mod as unknown as typeof Leaflet)
  map = L.map(el.value, { center: [25, 10], zoom: 2, minZoom: 1, maxZoom: 6, worldCopyJump: true })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 6,
  }).addTo(map)
  drawMarkers()
  // The container may not have its final size during hydration - recompute after layout.
  setTimeout(() => map?.invalidateSize(), 150)
})

// Rebuild markers when the competition (teams) changes; a crowd-lean shift only
// re-tints the existing rings (teamLean is a fresh object each patch, so a
// shallow watch fires).
watch(() => props.teams, drawMarkers, { deep: true })
watch(() => props.teamLean, retintMarkers)

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markers = null
  L = null
})
</script>

<template>
  <div class="relative">
    <div ref="el" class="w-full rounded-2xl border" style="height: 70vh; border-color: var(--p-content-border-color)" />
    <div v-if="hasLean" class="ng-lean-legend">
      <div class="font-semibold mb-1">{{ t('map.lean.title') }}</div>
      <div class="flex items-center gap-1.5">
        <span class="ng-lean-swatch" :style="{ background: leanColor(-1) }" />
        <span>{{ t('map.lean.underdog') }}</span>
        <span class="ng-lean-swatch" :style="{ background: leanColor(0) }" />
        <span>{{ t('map.lean.neutral') }}</span>
        <span class="ng-lean-swatch" :style="{ background: leanColor(1) }" />
        <span>{{ t('map.lean.favored') }}</span>
      </div>
    </div>
  </div>
</template>

<style>
.ng-flag-marker img {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  object-fit: cover;
  box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.ng-flag-marker img:hover {
  transform: scale(1.25);
}
.leaflet-container {
  background: var(--p-content-background);
  font-family: inherit;
}
.ng-lean-legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 1000;
  pointer-events: none;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--p-text-color);
  background: color-mix(in srgb, var(--p-content-background) 88%, transparent);
  border: 1px solid var(--p-content-border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(4px);
}
.ng-lean-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex: none;
}
</style>
