<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string
    desc: string
    icon: string
    tint?: string
    tier?: string | null
    locked?: boolean
    flag?: string | null
    editable?: boolean
    pinned?: boolean
    pinDisabled?: boolean
  }>(),
  {
    tint: 'var(--p-primary-color)',
    tier: null,
    locked: false,
    flag: null,
    editable: false,
    pinned: false,
    pinDisabled: false,
  },
)
const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="relative rounded-lg border p-3 flex flex-col items-center text-center gap-0.5 transition"
    :class="locked ? 'opacity-40' : ''"
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
    <span
      v-tooltip.top="locked ? t('achievements.lockedHint') : ''"
      class="text-xs leading-snug"
      style="color: var(--p-text-muted-color)"
    >{{ desc }}</span>

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
