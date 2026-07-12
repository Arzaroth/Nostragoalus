<script setup lang="ts">
// A hidden <audio> playing one peer's remote stream. srcObject can't be set via a
// template attribute, so it is assigned imperatively and kept in sync. sinkId
// routes the output to the chosen speaker where setSinkId is supported.
const props = defineProps<{ stream: MediaStream; sinkId?: string | null }>()
const el = ref<HTMLAudioElement | null>(null)

function attach(): void {
  if (el.value) el.value.srcObject = props.stream
}
async function applySink(): Promise<void> {
  const audio = el.value as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
  if (!audio?.setSinkId) return
  try {
    await audio.setSinkId(props.sinkId ?? '')
  } catch {
    // The chosen output may be gone; the browser keeps playing on the default.
  }
}
onMounted(() => {
  attach()
  void applySink()
})
watch(() => props.stream, attach)
watch(() => props.sinkId, () => void applySink())
</script>

<template>
  <audio ref="el" autoplay class="hidden" />
</template>
