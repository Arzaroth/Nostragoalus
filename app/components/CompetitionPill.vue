<script setup lang="ts">
const { data: competitions } = useCompetitions()
const slug = useSelectedCompetition()
const route = useRoute()
const router = useRouter()
const menu = ref()

const current = computed(() => competitions.value?.find((c) => c.slug === slug.value))

// Switch competition but keep the kind of page you're on (detail pages fall back to a list).
function targetPath(s: string) {
  const section = route.path.split('/')[2] || 'matches'
  if (['bracket', 'map', 'leaderboard', 'predictions', 'matches'].includes(section)) return `/${s}/${section}`
  if (section === 'users') return `/${s}/leaderboard`
  return `/${s}/matches`
}
function switchTo(s: string) {
  menu.value?.hide?.()
  router.push(targetPath(s))
}
</script>

<template>
  <button
    type="button"
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
        class="px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10"
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
