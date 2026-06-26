<script setup lang="ts">
import { REACTION_EMOJIS, type ReactionEmoji } from '#shared/reactions'
import type { DecryptedMessage } from '~/composables/useLeagueChat'
import { chatImageFilename, toPng } from '~/utils/image'

// A full-screen image viewer shared by the message thumbnails and the room media
// gallery. It is driven by a list of {messageId, idx, epoch} plus an index, so it
// can cycle through one message's images or every image in the room. The current
// image's owning message (looked up by id) supplies the caption + reactions shown
// beneath it. Bytes are fetched + decrypted on demand via `load` and cached as
// blob URLs while open. It sits above the Leaflet map (z-[2000]); the map's panes
// would otherwise paint over it.
const props = defineProps<{
  items: { messageId: string; idx: number; epoch: number }[]
  messages: DecryptedMessage[]
  load: (messageId: string, idx: number, epoch: number) => Promise<Uint8Array | null>
  react: (messageId: string, emoji: ReactionEmoji) => void
  league?: string
  match?: string
}>()
const visible = defineModel<boolean>('visible', { default: false })
const index = defineModel<number>('index', { default: 0 })

const { t } = useI18n()

const current = computed(() => props.items[index.value] ?? null)
const message = computed<DecryptedMessage | null>(
  () => (current.value ? props.messages.find((m) => m.id === current.value!.messageId) ?? null : null),
)
const hasPrev = computed(() => index.value > 0)
const hasNext = computed(() => index.value < props.items.length - 1)

// Decrypted blobs + their object URLs, keyed by messageId:idx, cached while the
// viewer is open and revoked on close so the plaintext never lingers.
const cache = new Map<string, { blob: Blob; url: string }>()
const src = ref<string | null>(null)
// The current image's blob, mirrored as a ref so copy/download/share + canShare
// react when it loads (the cache is a plain Map and would not trigger them).
const currentBlob = ref<Blob | null>(null)
const loading = ref(false)
const failed = ref(false)
let token = 0

function keyOf(it: { messageId: string; idx: number }): string {
  return `${it.messageId}:${it.idx}`
}

async function showCurrent(): Promise<void> {
  const it = current.value
  if (!it) return
  const k = keyOf(it)
  const hit = cache.get(k)
  if (hit) {
    src.value = hit.url
    currentBlob.value = hit.blob
    failed.value = false
    loading.value = false
    return
  }
  const mine = ++token
  loading.value = true
  failed.value = false
  src.value = null
  currentBlob.value = null
  const bytes = await props.load(it.messageId, it.idx, it.epoch)
  if (mine !== token) return // moved on while decrypting
  if (!bytes) {
    failed.value = true
    loading.value = false
    return
  }
  const blob = new Blob([bytes as BlobPart], { type: 'image/webp' })
  const url = URL.createObjectURL(blob)
  cache.set(k, { blob, url })
  src.value = url
  currentBlob.value = blob
  loading.value = false
}

function clearCache(): void {
  for (const { url } of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
}

function prev(): void {
  if (hasPrev.value) index.value--
}
function next(): void {
  if (hasNext.value) index.value++
}
function close(): void {
  visible.value = false
}

watch([visible, index, () => props.items.length], () => {
  if (visible.value) void showCurrent()
})
watch(visible, (v) => {
  if (!v) {
    token++
    src.value = null
    currentBlob.value = null
    clearCache()
  }
})

function onKey(e: KeyboardEvent): void {
  if (!visible.value) return
  if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearCache()
})

const canShare = computed(
  () =>
    import.meta.client &&
    !!navigator.canShare &&
    !!currentBlob.value &&
    navigator.canShare({ files: [new File([currentBlob.value], 'image.png', { type: 'image/png' })] }),
)

function filename(ext: string): string {
  return chatImageFilename({ league: props.league, match: props.match, date: new Date(), ext })
}

async function copy(): Promise<void> {
  const blob = currentBlob.value
  if (!blob || !navigator.clipboard?.write) return
  try {
    const png = await toPng(blob)
    await navigator.clipboard.write([new ClipboardItem({ [png.type]: png })])
  } catch {
    // clipboard image write unsupported - ignore
  }
}
async function download(): Promise<void> {
  const blob = currentBlob.value
  if (!blob) return
  const png = await toPng(blob)
  const url = URL.createObjectURL(png)
  const a = document.createElement('a')
  a.href = url
  a.download = filename('png')
  a.click()
  URL.revokeObjectURL(url)
}
async function share(): Promise<void> {
  const blob = currentBlob.value
  if (!blob) return
  try {
    const png = await toPng(blob)
    await navigator.share({ files: [new File([png], filename('png'), { type: png.type })] })
  } catch {
    // cancelled or unsupported - ignore
  }
}

function emojisWithCount(reactions: Record<ReactionEmoji, number>): ReactionEmoji[] {
  return REACTION_EMOJIS.filter((e) => reactions[e] > 0)
}
const pickerOpen = ref(false)
function reactWith(emoji: ReactionEmoji): void {
  if (!message.value) return
  pickerOpen.value = false
  props.react(message.value.id, emoji)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[2000] flex flex-col items-center justify-center p-4"
      style="background: rgba(0,0,0,0.85)"
      @click.self="close"
    >
      <!-- Prev / next, only when the list has more than one image. -->
      <button
        v-if="hasPrev"
        type="button"
        class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white"
        style="background: rgba(255,255,255,0.12)"
        :aria-label="t('chat.image.prev')"
        @click="prev"
      >
        <i class="pi pi-chevron-left text-lg" />
      </button>
      <button
        v-if="hasNext"
        type="button"
        class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white"
        style="background: rgba(255,255,255,0.12)"
        :aria-label="t('chat.image.next')"
        @click="next"
      >
        <i class="pi pi-chevron-right text-lg" />
      </button>

      <div class="flex flex-col items-center gap-3 max-w-full" @click.stop>
        <div v-if="loading" class="w-64 h-40 rounded-lg animate-pulse" style="background: rgba(255,255,255,0.1)" />
        <span v-else-if="failed" class="text-sm italic text-white/80">{{ t('chat.image.failed') }}</span>
        <img v-else-if="src" :src="src" :alt="t('chat.image.alt')" class="max-w-full max-h-[70vh] rounded-lg object-contain">

        <span v-if="items.length > 1" class="text-xs text-white/60 tabular-nums">{{ index + 1 }} / {{ items.length }}</span>

        <!-- The owning message's caption + reactions, when known. -->
        <p v-if="message?.text" class="max-w-[40rem] text-sm text-white/90 whitespace-pre-wrap break-words text-center">{{ message.text }}</p>
        <div v-if="message" class="flex flex-wrap items-center justify-center gap-1">
          <button
            v-for="e in emojisWithCount(message.reactions)"
            :key="e"
            type="button"
            :aria-label="t(`reactions.label.${e}`)"
            :aria-pressed="message.myReaction === e"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs tabular-nums"
            :style="message.myReaction === e
              ? 'border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 25%, transparent); color: #fff'
              : 'border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.8)'"
            @click="reactWith(e)"
          >
            <ReactionGlyph :emoji="e" />
            <span>{{ message.reactions[e] }}</span>
          </button>
          <div class="relative inline-flex">
            <button
              type="button"
              class="inline-flex items-center justify-center w-6 h-6 rounded-full text-white/70 hover:text-white"
              :aria-label="t('chat.react.add')"
              @click="pickerOpen = !pickerOpen"
            >
              <i class="pi pi-face-smile text-xs" />
            </button>
            <div
              v-if="pickerOpen"
              class="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 rounded-full border shadow-lg"
              style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
            >
              <button
                v-for="e in REACTION_EMOJIS"
                :key="e"
                type="button"
                :aria-label="t(`reactions.label.${e}`)"
                class="inline-flex items-center justify-center w-7 h-7 rounded-full hover:scale-110 transition-transform"
                @click="reactWith(e)"
              >
                <ReactionGlyph :emoji="e" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button icon="pi pi-copy" :label="t('chat.image.copy')" size="small" severity="secondary" @click="copy" />
          <Button icon="pi pi-download" :label="t('chat.image.download')" size="small" severity="secondary" @click="download" />
          <Button v-if="canShare" icon="pi pi-share-alt" :label="t('chat.image.share')" size="small" severity="secondary" @click="share" />
          <Button icon="pi pi-times" :label="t('chat.image.close')" size="small" text class="!text-white" @click="close" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
