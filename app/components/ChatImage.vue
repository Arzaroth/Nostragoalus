<script setup lang="ts">
// One encrypted chat image. The bytes are fetched and decrypted on demand via the
// provided loader (which holds the group key), turned into a local blob URL, and
// shown as a thumbnail that opens a lightbox with copy / download / share. The
// plaintext image only ever exists in this browser.
const props = defineProps<{ load: () => Promise<Uint8Array | null> }>()
const { t } = useI18n()

const src = ref<string | null>(null)
const loading = ref(true)
const failed = ref(false)
const open = ref(false)
let blob: Blob | null = null

const canShare = computed(
  () => import.meta.client && !!navigator.canShare && !!blob && navigator.canShare({ files: [new File([blob], 'image.webp', { type: 'image/webp' })] }),
)

onMounted(async () => {
  try {
    const bytes = await props.load()
    if (!bytes) {
      failed.value = true
      return
    }
    blob = new Blob([bytes], { type: 'image/webp' })
    src.value = URL.createObjectURL(blob)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
onUnmounted(() => {
  if (src.value) URL.revokeObjectURL(src.value)
})

async function copy() {
  if (!blob || !navigator.clipboard?.write) return
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
  } catch {
    // clipboard image write unsupported - ignore
  }
}
function download() {
  if (!src.value) return
  const a = document.createElement('a')
  a.href = src.value
  a.download = 'chat-image.webp'
  a.click()
}
async function share() {
  if (!blob) return
  try {
    await navigator.share({ files: [new File([blob], 'chat-image.webp', { type: blob.type })] })
  } catch {
    // cancelled or unsupported - ignore
  }
}
</script>

<template>
  <div class="mt-1">
    <div v-if="loading" class="w-40 h-24 rounded-lg animate-pulse" style="background: color-mix(in srgb, var(--p-text-color) 10%, transparent)" />
    <span v-else-if="failed" class="text-xs italic" style="color: var(--p-text-muted-color)">{{ t('chat.image.failed') }}</span>
    <img
      v-else-if="src"
      :src="src"
      :alt="t('chat.image.alt')"
      class="max-w-[12rem] max-h-48 rounded-lg cursor-zoom-in object-cover"
      @click="open = true"
    >

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="open && src"
        class="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4"
        style="background: rgba(0,0,0,0.8)"
        @click.self="open = false"
      >
        <img :src="src" :alt="t('chat.image.alt')" class="max-w-full max-h-[80vh] rounded-lg object-contain">
        <div class="flex items-center gap-2 mt-3">
          <Button icon="pi pi-copy" :label="t('chat.image.copy')" size="small" severity="secondary" @click="copy" />
          <Button icon="pi pi-download" :label="t('chat.image.download')" size="small" severity="secondary" @click="download" />
          <Button v-if="canShare" icon="pi pi-share-alt" :label="t('chat.image.share')" size="small" severity="secondary" @click="share" />
          <Button icon="pi pi-times" :label="t('chat.image.close')" size="small" text @click="open = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
