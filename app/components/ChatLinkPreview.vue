<script setup lang="ts">
// Collapsible link-preview card. Asks the server to unfurl the URL (the URL, not
// the message, leaves the device - see the unfurl util) and renders whatever
// open-graph metadata comes back. Hides itself entirely when there is nothing
// useful to show. The remote image is loaded by the reader's browser with no
// referrer, so the origin site can't see which page linked it.
import type { LinkPreviewDTO } from '#shared/types/chat'

const props = defineProps<{ href: string; alignEnd?: boolean }>()
const { t } = useI18n()

const data = ref<LinkPreviewDTO | null>(null)
const loading = ref(true)
const collapsed = ref(false)

const host = computed(() => {
  try {
    return new URL(props.href).host
  } catch {
    return props.href
  }
})
const hasContent = computed(() => !!(data.value && (data.value.title || data.value.description || data.value.image)))

onMounted(async () => {
  try {
    data.value = await $fetch<LinkPreviewDTO>('/api/chat/unfurl', { query: { url: props.href } })
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div
    v-if="loading || hasContent"
    class="w-72 max-w-full rounded-lg border overflow-hidden text-xs"
    :class="alignEnd ? 'self-end' : 'self-start'"
    style="background: color-mix(in srgb, var(--p-text-color) 4%, var(--p-content-background)); border-color: var(--p-content-border-color)"
  >
    <div class="flex items-center gap-2 px-2 py-1 border-b" style="border-color: var(--p-content-border-color)">
      <i class="pi pi-link text-[10px]" style="color: var(--p-primary-color)" />
      <span class="truncate flex-1" style="color: var(--p-text-muted-color)">{{ t('chat.embed.preview') }}</span>
      <button
        v-if="hasContent"
        type="button"
        class="opacity-60 hover:opacity-100"
        :aria-label="collapsed ? t('chat.embed.showPreview') : t('chat.embed.hidePreview')"
        @click="collapsed = !collapsed"
      >
        <i :class="collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'" class="text-[10px]" />
      </button>
    </div>
    <div v-if="loading" class="p-2" style="color: var(--p-text-muted-color)">
      <div class="h-3 w-2/3 rounded animate-pulse" style="background: color-mix(in srgb, var(--p-text-color) 10%, transparent)" />
    </div>
    <a v-else-if="!collapsed" :href="href" target="_blank" rel="noopener noreferrer nofollow" class="block hover:opacity-90 transition-opacity">
      <img
        v-if="data?.image"
        :src="data.image"
        :alt="data?.title ?? host"
        loading="lazy"
        referrerpolicy="no-referrer"
        class="w-full max-h-32 object-cover"
        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
      >
      <div class="p-2 flex flex-col gap-0.5">
        <span class="font-semibold line-clamp-2" style="color: var(--p-text-color)">{{ data?.title ?? host }}</span>
        <span v-if="data?.description" class="line-clamp-2" style="color: var(--p-text-muted-color)">{{ data.description }}</span>
        <span class="truncate opacity-70" style="color: var(--p-text-muted-color)">{{ data?.siteName ?? host }}</span>
      </div>
    </a>
  </div>
</template>
