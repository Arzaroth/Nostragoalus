<script setup lang="ts">
// Renders a decrypted chat message body: text with inline @mentions and links in
// a coloured bubble, then any image URLs as collapsible inline images, then a
// collapsible preview for the first plain link. No v-html - text is interpolated
// (Vue escapes it) and only http(s) URLs become a link/image src.
import { parseChatContent, firstPreviewLink } from '~/utils/chat-content'

const props = defineProps<{
  text: string
  names: Record<string, string>
  profileLink: (id: string) => string | null
  own?: boolean
  bubbleStyle?: string
}>()
const { t } = useI18n()

const tokens = computed(() => parseChatContent(props.text))
// Inline run = everything that sits in the text bubble (skip images, and skip
// whitespace-only text so a lone image URL doesn't draw an empty bubble).
const hasInline = computed(() =>
  tokens.value.some((tok) => (tok.type === 'text' ? tok.value.trim() !== '' : tok.type !== 'image')),
)
const previewHref = computed(() => firstPreviewLink(tokens.value))
const hiddenImages = reactive<Record<number, boolean>>({})

function mentionName(id: string): string {
  return props.names[id] ?? t('chat.unknownUser')
}
</script>

<template>
  <div class="flex flex-col gap-1 min-w-0 max-w-full" :class="own ? 'items-end' : 'items-start'">
    <div v-if="hasInline" class="inline-block rounded-2xl px-3 py-1.5 max-w-full whitespace-pre-wrap break-words" :style="bubbleStyle">
      <template v-for="(tok, i) in tokens" :key="i">
        <span v-if="tok.type === 'text'">{{ tok.value }}</span>
        <NuxtLink
          v-else-if="tok.type === 'mention' && profileLink(tok.userId)"
          :to="profileLink(tok.userId)!"
          class="font-semibold rounded px-0.5 hover:underline"
          style="color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 12%, transparent)"
        >@{{ mentionName(tok.userId) }}</NuxtLink>
        <span v-else-if="tok.type === 'mention'" class="font-semibold" style="color: var(--p-primary-color)">@{{ mentionName(tok.userId) }}</span>
        <a v-else-if="tok.type === 'link'" :href="tok.href" target="_blank" rel="noopener noreferrer nofollow" class="underline break-all">{{ tok.label }}</a>
      </template>
    </div>

    <!-- Image URLs rendered dynamically (animated gifs included); never stored. -->
    <template v-for="(tok, i) in tokens" :key="`img-${i}`">
      <div v-if="tok.type === 'image'" class="flex flex-col gap-0.5" :class="own ? 'items-end' : 'items-start'">
        <a v-if="!hiddenImages[i]" :href="tok.href" target="_blank" rel="noopener noreferrer nofollow">
          <img :src="tok.href" :alt="t('chat.image.alt')" loading="lazy" referrerpolicy="no-referrer" class="rounded-lg max-h-60 max-w-full object-contain border" style="border-color: var(--p-content-border-color)">
        </a>
        <button
          type="button"
          class="text-[10px] underline opacity-60 hover:opacity-100 inline-flex items-center gap-1"
          @click="hiddenImages[i] = !hiddenImages[i]"
        >
          <i :class="hiddenImages[i] ? 'pi pi-image' : 'pi pi-eye-slash'" class="text-[10px]" />
          {{ hiddenImages[i] ? t('chat.embed.showImage') : t('chat.embed.hideImage') }}
        </button>
      </div>
    </template>

    <ChatLinkPreview v-if="previewHref" :href="previewHref" :align-end="own" />
  </div>
</template>
