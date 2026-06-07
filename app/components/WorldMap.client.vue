<script setup lang="ts">
import L from 'leaflet'

const props = defineProps<{ teams: { code: string; name: string }[] }>()
const emit = defineEmits<{ select: [team: { code: string; name: string }] }>()

// Approximate country centroids by FIFA tricode (covers WC/Euro nations; others are skipped).
const COORDS: Record<string, [number, number]> = {
  QAT: [25.3, 51.2], ECU: [-1.8, -78.2], SEN: [14.5, -14.5], NED: [52.1, 5.3], ENG: [52.5, -1.5],
  IRN: [32.4, 53.7], USA: [39.8, -98.6], WAL: [52.3, -3.8], ARG: [-38.4, -63.6], KSA: [23.9, 45.1],
  MEX: [23.6, -102.6], POL: [51.9, 19.1], FRA: [46.2, 2.2], AUS: [-25.3, 133.8], DEN: [56.3, 9.5],
  TUN: [33.9, 9.6], ESP: [40.0, -3.7], CRC: [9.7, -83.8], GER: [51.2, 10.4], JPN: [36.2, 138.3],
  BEL: [50.5, 4.5], CAN: [56.1, -106.3], MAR: [31.8, -7.1], CRO: [45.1, 15.2], BRA: [-14.2, -51.9],
  SRB: [44.0, 21.0], SUI: [46.8, 8.2], CMR: [7.4, 12.4], POR: [39.4, -8.2], GHA: [7.9, -1.0],
  URU: [-32.5, -55.8], KOR: [35.9, 127.8], ITA: [41.9, 12.6], COL: [4.6, -74.3], CHI: [-35.7, -71.5],
  NGA: [9.1, 8.7], EGY: [26.8, 30.8], SCO: [56.5, -4.2], NOR: [60.5, 8.5], SWE: [60.1, 18.6],
  UKR: [48.4, 31.2], AUT: [47.5, 14.6], TUR: [38.9, 35.2], GRE: [39.1, 21.8], CZE: [49.8, 15.5],
  ALG: [28.0, 1.7], CIV: [7.5, -5.5], JAM: [18.1, -77.3], PAN: [8.5, -80.8], PER: [-9.2, -75.0],
  PAR: [-23.4, -58.4], VEN: [6.4, -66.6], NZL: [-40.9, 174.9], RSA: [-30.6, 22.9], NGR: [9.1, 8.7],
}

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
  // The container may not have its final size during hydration — recompute after layout.
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
