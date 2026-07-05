<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string
    desc: string
    criteria?: string
    icon: string
    tint?: string
    tier?: string | null
    locked?: boolean
    flag?: string | null
    progress?: { current: number; target: number } | null
    editable?: boolean
    pinned?: boolean
    pinDisabled?: boolean
  }>(),
  {
    criteria: '',
    tint: 'var(--p-primary-color)',
    tier: null,
    locked: false,
    flag: null,
    progress: null,
    editable: false,
    pinned: false,
    pinDisabled: false,
  },
)
const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n()

// The tooltip always states the concrete unlock criteria. Locked tiles prefix it
// with the "Locked" label so it reads as "how to earn this"; earned tiles read as
// "what you did". Falls back to the old generic hint if no criteria was supplied.
const tip = computed(() => {
  if (!props.criteria) return props.locked ? t('achievements.lockedHint') : ''
  return props.locked ? `${t('achievements.locked')} - ${props.criteria}` : props.criteria
})

const progressPct = computed(() =>
  props.progress ? Math.min(100, Math.round((props.progress.current / props.progress.target) * 100)) : 0,
)
</script>

<template>
  <div
    v-tooltip.top="tip"
    class="relative rounded-lg border p-3 flex flex-col items-center text-center gap-0.5 transition"
    :class="[locked ? 'opacity-40' : '', tip ? 'cursor-help' : '']"
    style="border-color: var(--p-content-border-color)"
  >
    <span
      v-if="tier"
      class="absolute top-1 end-1 text-[10px] font-bold uppercase tracking-wide px-1.5 rounded-full text-white"
      :style="`background:${tint}`"
    >{{ tier }}</span>

    <img v-if="flag && !locked" :src="flag" class="w-9 h-9 rounded shadow-sm" alt="">
    <i v-else :class="locked ? 'pi pi-lock' : icon" class="text-2xl" :style="locked ? '' : `color:${tint}`" />

    <span class="text-sm font-semibold leading-tight mt-1">{{ name }}</span>
    <span class="text-xs leading-snug" style="color: var(--p-text-muted-color)">{{ desc }}</span>

    <div
      v-if="progress"
      class="mt-1.5 w-full flex flex-col items-center gap-0.5"
      :aria-label="t('achievements.progress', { current: progress.current, target: progress.target })"
    >
      <div class="h-1.5 w-full rounded-full overflow-hidden" style="background: var(--p-content-border-color)">
        <div class="h-full rounded-full transition-all" :style="`width:${progressPct}%;background:${tint}`" />
      </div>
      <span class="text-[10px] tabular-nums" style="color: var(--p-text-muted-color)">
        {{ progress.current }} / {{ progress.target }}
      </span>
    </div>

    <button
      v-if="editable"
      type="button"
      class="mt-1.5 text-xs rounded-full px-2.5 py-0.5 border transition disabled:opacity-40"
      :style="
        pinned
          ? `color:#fff;background:${tint};border-color:${tint}`
          : 'border-color: var(--p-content-border-color)'
      "
      :disabled="!pinned && pinDisabled"
      @click="emit('toggle')"
    >
      <i class="pi" :class="pinned ? 'pi-check' : 'pi-thumbtack'" />
      {{ pinned ? t('achievements.unpin') : t('achievements.pin') }}
    </button>
  </div>
</template>
