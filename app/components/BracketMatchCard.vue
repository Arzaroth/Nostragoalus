<script setup lang="ts">
const slug = useSelectedCompetition()
const { t, locale } = useI18n()
const props = defineProps<{ match: any }>()
const NuxtLinkC = resolveComponent('NuxtLink')
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

// Per side: the official team if decided, else the projected qualifier (marked),
// else the raw placeholder ("1A") as plain text.
function side(code: string | null, team: string, projCode?: string | null, projTeam?: string | null) {
  if (code) return { code, label: code || team, projected: false }
  if (projCode) return { code: projCode, label: projCode, projected: true }
  return { code: null as string | null, label: team, projected: false }
}
const home = computed(() => side(props.match.homeCode, props.match.homeTeam, props.match.homeProjectedCode, props.match.homeProjectedTeam))
const away = computed(() => side(props.match.awayCode, props.match.awayTeam, props.match.awayProjectedCode, props.match.awayProjectedTeam))
const hasProjected = computed(() => home.value.projected || away.value.projected)
</script>

<template>
  <component
    :is="match.id ? NuxtLinkC : 'div'"
    :to="match.id ? `/${slug}/matches/${match.id}` : undefined"
    class="br-card relative"
    style="background: var(--p-content-background); border: 1px solid var(--p-content-border-color)"
  >
    <span
      v-if="hasProjected"
      v-tooltip.top="t('bracket.projectedHint')"
      class="br-proj-chip"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
    >{{ t('bracket.projected') }}</span>
    <div class="flex items-center justify-between gap-1">
      <span class="br-team" :class="{ win: match.winner === 'HOME', 'br-proj': home.projected }">
        <img v-if="flagUrl(home.code)" :src="flagUrl(home.code) || ''" class="br-flag" alt="" ><i v-else class="pi pi-shield br-shield" />
        <span class="truncate">{{ home.label }}</span><b v-if="match.homeScore !== null" class="ml-1 tabular-nums">{{ match.homeScore }}<sup v-if="match.homePens !== null" class="br-pens">({{ match.homePens }})</sup></b>
      </span>
      <span class="br-team justify-end" :class="{ win: match.winner === 'AWAY', 'br-proj': away.projected }">
        <b v-if="match.awayScore !== null" class="mr-1 tabular-nums"><sup v-if="match.awayPens !== null" class="br-pens">({{ match.awayPens }})</sup>{{ match.awayScore }}</b><span class="truncate">{{ away.label }}</span>
        <img v-if="flagUrl(away.code)" :src="flagUrl(away.code) || ''" class="br-flag" alt="" ><i v-else class="pi pi-shield br-shield" />
      </span>
    </div>
    <div v-if="match.kickoffTime" class="br-date">{{ fmtDate(match.kickoffTime) }}</div>
  </component>
</template>

<style scoped>
.br-card {
  display: block;
  width: 11rem;
  border-radius: 0.55rem;
  padding: 0.45rem 0.6rem;
  transition: border-color 0.15s ease;
}
a.br-card:hover {
  border-color: var(--p-primary-color) !important;
}
.br-team {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
  min-width: 0;
  max-width: 47%;
}
.br-team.win {
  font-weight: 800;
}
/* Projected side: the flag/name carry a dashed underline so it reads as
   not-yet-official at a glance (alongside the corner chip). */
.br-proj .truncate {
  font-style: italic;
  border-bottom: 1px dashed var(--p-primary-color);
}
.br-proj .br-flag {
  opacity: 0.85;
}
.br-proj-chip {
  position: absolute;
  top: -0.5rem;
  right: 0.4rem;
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
}
.br-flag {
  width: 1rem;
  height: 1rem;
  border-radius: 2px;
  object-fit: cover;
  flex-shrink: 0;
}
.br-pens {
  font-size: 0.6em;
  font-weight: 600;
  opacity: 0.75;
  margin: 0 1px;
}
.br-shield {
  font-size: 0.65rem;
  opacity: 0.4;
}
.br-date {
  margin-top: 0.15rem;
  font-size: 0.58rem;
  color: var(--p-text-muted-color);
  text-align: center;
}
</style>
