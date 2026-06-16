<script setup lang="ts">
import L from 'leaflet'
import { COUNTRY_CENTROIDS as COORDS } from '../utils/country-centroids'

const props = defineProps<{ teams: { code: string; name: string }[] }>()
const emit = defineEmits<{ select: [team: { code: string; name: string }] }>()

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
    const icon = L.divIcon({
      className: 'ng-flag-marker',
      html: `<img src="https://api.fifa.com/api/v3/picture/flags-sq-3/${team.code}" alt="" />`,
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

// Redraw markers when the competition (teams) changes.
watch(() => props.teams, drawMarkers, { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markers = null
})
</script>

<template>
  <div ref="el" class="w-full rounded-2xl border" style="height: 70vh; border-color: var(--p-content-border-color)" />
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
</style>
