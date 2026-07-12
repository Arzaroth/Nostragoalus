<script setup lang="ts">
// A hidden <audio> playing one peer's remote stream. srcObject can't be set via a
// template attribute, so it is assigned imperatively and kept in sync.
const props = defineProps<{ stream: MediaStream }>()
const el = ref<HTMLAudioElement | null>(null)

function attach(): void {
  if (el.value) el.value.srcObject = props.stream
}
onMounted(attach)
watch(() => props.stream, attach)
</script>

<template>
  <audio ref="el" autoplay class="hidden" />
</template>
