<script setup lang="ts">
const { data: rows, isLoading } = useLeaderboard()
const { session } = useAuth()
const meId = computed(() => session?.data?.user?.id)

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-5">Global ranking</h1>
    <div v-if="isLoading" class="opacity-60">Loading…</div>
    <div v-else-if="!rows || !rows.length" class="opacity-60">No scores yet — predictions get scored once matches finish.</div>

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="r in rows"
        :key="r.userId"
        class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
        :style="`background: var(--p-content-background); border-color: ${r.userId === meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === meId ? '2px' : '1px'}`"
      >
        <div class="w-8 text-center font-bold tabular-nums text-lg shrink-0">
          <span v-if="medal(r.rank)">{{ medal(r.rank) }}</span>
          <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
        </div>
        <Avatar
          :label="(r.displayName || '?').charAt(0).toUpperCase()"
          shape="circle"
          class="!bg-[var(--p-primary-color)] !text-[var(--p-primary-contrast-color)] font-bold shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">
            {{ r.displayName }}
            <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">(you)</span>
          </div>
          <div class="text-xs" style="color: var(--p-text-muted-color)">{{ r.exactCount }} exact · {{ r.outcomeCount }} correct</div>
        </div>
        <div class="text-right shrink-0">
          <span class="text-xl font-bold tabular-nums">{{ r.totalPoints }}</span>
          <span class="text-xs ml-1" style="color: var(--p-text-muted-color)">pts</span>
        </div>
      </div>
    </div>
  </div>
</template>
