<script setup lang="ts">
// Avatar that falls back to the brand placeholder when the image fails to load
// (SSO-provided image URLs are often gone or unreachable, leaving a broken img).
const props = defineProps<{ image?: string | null; size?: 'normal' | 'large' | 'xlarge' }>()
const failed = ref(false)
watch(() => props.image, () => (failed.value = false))
const src = computed(() => (!props.image || failed.value ? '/brand/avatar.svg' : props.image))
</script>

<template>
  <Avatar :image="src" :size="size" shape="circle" class="shrink-0 overflow-hidden" @error="failed = true" />
</template>
