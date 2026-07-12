<script setup lang="ts">
// Avatar that falls back to the brand placeholder when the image fails to load
// (SSO-provided image URLs are often gone or unreachable, leaving a broken img).
// Pass `userId` to show a live presence dot (green active, amber idle, none
// offline) - omitted in the header menu, where presence isn't wanted.
import { usePresence } from '~/composables/usePresence'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ image?: string | null; size?: 'normal' | 'large' | 'xlarge'; userId?: string | null }>()
const { t } = useI18n()
const failed = ref(false)
watch(() => props.image, () => (failed.value = false))
const src = computed(() => (!props.image || failed.value ? '/brand/avatar.svg' : props.image))

const { statusOf } = usePresence()
const status = computed(() => (props.userId ? statusOf(props.userId) : 'offline'))
const dotColor = computed(() => (status.value === 'active' ? '#22c55e' : status.value === 'idle' ? '#eab308' : null))
const dotSize = computed(() => (props.size === 'xlarge' ? '0.85rem' : props.size === 'large' ? '0.7rem' : '0.55rem'))
</script>

<template>
  <span class="relative inline-flex shrink-0 align-middle">
    <Avatar v-bind="$attrs" :image="src" :size="size" shape="circle" class="shrink-0 overflow-hidden" @error="failed = true" />
    <span
      v-if="dotColor"
      v-tooltip.top="t(`presence.${status}`)"
      class="absolute bottom-0 right-0 rounded-full"
      :style="{ width: dotSize, height: dotSize, background: dotColor, boxShadow: '0 0 0 2px var(--p-content-background)' }"
    />
  </span>
</template>
