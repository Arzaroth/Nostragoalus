<script setup lang="ts">
defineProps<{ match: any }>()
const NuxtLinkC = resolveComponent('NuxtLink')
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })
}
</script>

<template>
  <component
    :is="match.id ? NuxtLinkC : 'div'"
    :to="match.id ? `/matches/${match.id}` : undefined"
    class="br-card"
    style="background: var(--p-content-background); border: 1px solid var(--p-content-border-color)"
  >
    <div class="flex items-center justify-between gap-1">
      <span class="br-team" :class="{ win: match.winner === 'HOME' }">
        <img v-if="flagUrl(match.homeCode)" :src="flagUrl(match.homeCode) || ''" class="br-flag" alt="" ><i v-else class="pi pi-shield br-shield" />
        <span class="truncate">{{ match.homeCode || match.homeTeam }}</span><b v-if="match.homeScore !== null" class="ml-1 tabular-nums">{{ match.homeScore }}</b>
      </span>
      <span class="br-team justify-end" :class="{ win: match.winner === 'AWAY' }">
        <b v-if="match.awayScore !== null" class="mr-1 tabular-nums">{{ match.awayScore }}</b><span class="truncate">{{ match.awayCode || match.awayTeam }}</span>
        <img v-if="flagUrl(match.awayCode)" :src="flagUrl(match.awayCode) || ''" class="br-flag" alt="" ><i v-else class="pi pi-shield br-shield" />
      </span>
    </div>
    <div class="br-date">{{ fmtDate(match.kickoffTime) }}</div>
  </component>
</template>

<style scoped>
.br-card {
  display: block;
  width: 8rem;
  border-radius: 0.55rem;
  padding: 0.38rem 0.5rem;
  transition: border-color 0.15s ease;
}
a.br-card:hover {
  border-color: var(--p-primary-color) !important;
}
.br-team {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
  min-width: 0;
  max-width: 47%;
}
.br-team.win {
  font-weight: 800;
}
.br-flag {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 2px;
  object-fit: cover;
  flex-shrink: 0;
}
.br-shield {
  font-size: 0.65rem;
  opacity: 0.4;
}
.br-date {
  margin-top: 0.15rem;
  font-size: 0.58rem;
  color: var(--p-text-muted-color);
}
</style>
