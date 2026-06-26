<script setup lang="ts">
import L from 'leaflet'
import { COUNTRY_CENTROIDS as COORDS } from '../utils/country-centroids'
import { leanColor } from '../utils/crowd-lean'

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
let map: L.Map | null = null
let markers: L.LayerGroup | null = null

function drawMarkers() {
  if (!map) return
  if (!markers) markers = L.layerGroup().addTo(map)
  markers.clearLayers()
  for (const team of props.teams) {
    const coord = COORDS[team.code]
    if (!coord) continue
    const lean = props.teamLean?.[team.code]
    const ring = lean === undefined ? '#fff' : leanColor(lean)
    const icon = L.divIcon({
      className: 'ng-flag-marker',
      html: `<img src="https://api.fifa.com/api/v3/picture/flags-sq-3/${team.code}" alt="" style="box-shadow: 0 0 0 3px ${ring}, 0 2px 6px rgba(0, 0, 0, 0.35)" />`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    L.marker(coord, { icon, title: team.name })
      .on('click', () => {
        emit('select', team)
        centerOn(team.code)
      })
      .addTo(markers)
  }
}

function centerOn(code: string) {
  const coord = COORDS[code]
  if (map && coord) map.flyTo(coord, Math.max(map.getZoom(), 4), { duration: 0.8 })
}
defineExpose({ centerOn })

onMounted(() => {
  if (!el.value) return
  map = L.map(el.value, { center: [25, 10], zoom: 2, minZoom: 1, maxZoom: 6, worldCopyJump: true })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 6,
  }).addTo(map)
  drawMarkers()
  // The container may not have its final size during hydration - recompute after layout.
  setTimeout(() => map?.invalidateSize(), 150)
})

// Redraw markers when the competition (teams) changes, or when the crowd lean
// shifts (live crowd patches re-tint the rings without a full reload).
watch(() => props.teams, drawMarkers, { deep: true })
watch(() => props.teamLean, drawMarkers, { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markers = null
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
