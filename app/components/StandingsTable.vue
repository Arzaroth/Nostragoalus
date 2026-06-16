<script setup lang="ts">
import type { StandingRow } from '../../server/utils/stats/standings'
// slug present => team names link to their team page. highlight => tint those
// rows (the two sides on a match page).
defineProps<{ rows: StandingRow[]; slug?: string; highlight?: (string | null)[] }>()
const { t } = useI18n()
const NuxtLinkC = resolveComponent('NuxtLink')
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="text-center" style="color: var(--p-text-muted-color)">
        <th class="py-1 text-left">#</th>
        <th class="text-left">{{ t('standings.team') }}</th>
        <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(row, i) in rows"
        :key="row.name"
        class="border-t text-center"
        :style="`border-color: var(--p-content-border-color)${highlight && row.code && highlight.includes(row.code) ? '; background: color-mix(in srgb, var(--p-primary-color) 14%, transparent)' : ''}`"
      >
        <td class="py-2 text-left">{{ i + 1 }}</td>
        <td class="text-left">
          <component
            :is="slug && row.code ? NuxtLinkC : 'span'"
            :to="slug && row.code ? `/${slug}/teams/${row.code}` : undefined"
            class="flex items-center gap-2"
            :class="slug && row.code ? 'hover:underline' : ''"
          >
            <img v-if="flagUrl(row.code)" :src="flagUrl(row.code) || ''" class="w-5 h-5 rounded" alt="" >{{ row.name }}
          </component>
        </td>
        <td>{{ row.played }}</td><td>{{ row.won }}</td><td>{{ row.drawn }}</td><td>{{ row.lost }}</td>
        <td>{{ row.gd > 0 ? '+' : '' }}{{ row.gd }}</td>
        <td class="font-bold">{{ row.points }}</td>
      </tr>
    </tbody>
  </table>
</template>
