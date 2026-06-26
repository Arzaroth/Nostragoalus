<script setup lang="ts">
// The image thumbnails on one chat message. Each attachment's bytes are fetched
// and decrypted on demand via the provided loader (which holds the group key) and
// shown as a small thumbnail; clicking one asks the parent to open the shared
// lightbox at that image. The plaintext only ever exists in this browser.
import type { ChatAttachmentDTO } from '#shared/types/chat'

const props = defineProps<{
  messageId: string
  attachments: ChatAttachmentDTO[]
  load: (messageId: string, idx: number, epoch: number) => Promise<Uint8Array | null>
}>()
const emit = defineEmits<{ open: [idx: number] }>()
const { t } = useI18n()

interface Thumb {
  idx: number
  src: string | null
  loading: boolean
  failed: boolean
}

const thumbs = ref<Thumb[]>([])
let alive = true
const urls: string[] = []

async function loadAll(): Promise<void> {
  thumbs.value = props.attachments.map((a) => ({ idx: a.idx, src: null, loading: true, failed: false }))
  await Promise.all(
    props.attachments.map(async (a, i) => {
      const bytes = await props.load(props.messageId, a.idx, a.epoch).catch(() => null)
      if (!alive) return
      const thumb = thumbs.value[i]
      if (!thumb) return
      if (!bytes) {
        thumb.failed = true
        thumb.loading = false
        return
      }
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }))
      urls.push(url)
      thumb.src = url
      thumb.loading = false
    }),
  )
}

function revoke(): void {
  for (const u of urls.splice(0)) URL.revokeObjectURL(u)
}

onMounted(loadAll)
// Re-load when the attachment set changes (an edit added/removed images).
watch(
  () => props.attachments.map((a) => `${a.idx}:${a.epoch}`).join(','),
  () => {
    revoke()
    void loadAll()
  },
)
onUnmounted(() => {
  alive = false
  revoke()
})
</script>

<template>
  <div v-if="attachments.length" class="mt-1 flex flex-wrap gap-1.5">
    <template v-for="thumb in thumbs" :key="thumb.idx">
      <div v-if="thumb.loading" class="w-28 h-20 rounded-lg animate-pulse" style="background: color-mix(in srgb, var(--p-text-color) 10%, transparent)" />
      <span v-else-if="thumb.failed" class="text-xs italic self-center" style="color: var(--p-text-muted-color)">{{ t('chat.image.failed') }}</span>
      <img
        v-else-if="thumb.src"
        :src="thumb.src"
        :alt="t('chat.image.alt')"
        class="w-28 h-20 rounded-lg cursor-zoom-in object-cover"
        @click="emit('open', thumb.idx)"
      >
    </template>
  </div>
</template>
