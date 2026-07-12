<script setup lang="ts">
// The @mention autocomplete dropdown, shared by the main composer, a thread reply
// and an inline edit. The parent owns the candidate list and selection index and
// positions this menu inside a `relative` anchor.
interface MentionCandidate {
  userId: string
  name: string
  image?: string | null
}
defineProps<{ candidates: readonly MentionCandidate[]; activeIndex: number }>()
defineEmits<{ select: [candidate: MentionCandidate]; hover: [index: number] }>()
</script>

<template>
  <div
    class="absolute bottom-full start-0 mb-2 z-30 w-64 max-w-full rounded-lg border shadow-lg py-1 overflow-hidden"
    style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
  >
    <button
      v-for="(c, i) in candidates"
      :key="c.userId"
      type="button"
      class="w-full flex items-center gap-2 px-3 py-1.5 text-start"
      :style="i === activeIndex ? 'background: color-mix(in srgb, var(--p-primary-color) 14%, transparent)' : ''"
      @mousedown.prevent="$emit('select', c)"
      @mouseenter="$emit('hover', i)"
    >
      <UserAvatar :image="c.image" :user-id="c.userId" class="!w-5 !h-5 shrink-0 text-[0.5rem]" />
      <span class="truncate text-sm">{{ c.name }}</span>
    </button>
  </div>
</template>
