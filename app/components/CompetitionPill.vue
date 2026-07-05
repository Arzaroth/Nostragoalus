<script setup lang="ts">
const { data: competitions } = useCompetitions()
const slug = useSelectedCompetition()
const route = useRoute()
const router = useRouter()
const menu = ref()

const current = computed(() => competitions.value?.find((c) => c.slug === slug.value))

// Switch competition but keep the kind of page you're on (detail pages fall back to a list).
function targetPath(s: string) {
  const parts = route.path.split('/')
  const section = parts[2] || 'matches'
  // A player exists across competitions - keep their page (and the team page).
  if (section === 'users' && parts[3]) return `/${s}/users/${parts[3]}`
  if (section === 'teams' && parts[3]) return `/${s}/teams/${parts[3]}`
  if (['bracket', 'map', 'leaderboard', 'matches', 'multiview'].includes(section)) return `/${s}/${section}`
  // a single match (matches/:id) has no equivalent elsewhere - fall back to the list
  return `/${s}/matches`
}
function switchTo(s: string) {
  menu.value?.hide?.()
  // Keep the query (e.g. the map's ?team=) so context survives the switch.
  router.push({ path: targetPath(s), query: route.query })
}
</script>

<template>
  <button
    type="button"
    data-tour="competition"
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
    style="border-color: var(--p-content-border-color); background: var(--p-content-background)"
    @click="(e) => menu.toggle(e)"
  >
    <i class="pi pi-trophy" style="color: var(--p-primary-color)" />
    <span class="truncate max-w-[14rem]">{{ current?.name ?? slug }}</span>
    <i class="pi pi-chevron-down text-xs opacity-60" />
  </button>
  <Popover ref="menu">
    <div class="flex flex-col w-60 -m-1">
      <button
        v-for="c in competitions"
        :key="c.slug"
        type="button"
        class="px-3 py-2 text-sm text-start flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
        :class="{ 'font-bold': c.slug === slug }"
        @click="switchTo(c.slug)"
      >
        <i class="pi pi-trophy text-xs" :style="c.slug === slug ? 'color: var(--p-primary-color)' : 'opacity:0.4'" />
        <span class="flex-1 truncate">{{ c.name }}</span>
        <i v-if="c.slug === slug" class="pi pi-check text-xs" style="color: var(--p-primary-color)" />
      </button>
    </div>
  </Popover>
</template>
