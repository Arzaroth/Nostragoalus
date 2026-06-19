<script setup lang="ts">
import { resolveEmbedAttrs, type MatchMediaItem, type MatchMediaKind } from '#shared/match-media'

const props = defineProps<{ item: MatchMediaItem }>()
const { t } = useI18n()

// Twitch's player rejects an embed without a matching `parent` host; this works
// SSR and client.
const host = useRequestURL().host
const attrs = computed(() => resolveEmbedAttrs(props.item, host))

function kindLabel(k: MatchMediaKind) {
  return t(`media.${k.toLowerCase()}`)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <template v-if="item.embeddable">
      <!-- Sandbox/allow/referrer come from resolveEmbedAttrs per link; a `sandbox`
           of undefined drops the attribute (a host that refuses sandboxing).
           allowfullscreen is static: a player whose `allow` omits the fullscreen
           token (e.g. a PPV embed mirroring its own policy) still needs the
           legacy attribute for its fullscreen button. The link below is a
           permanent fallback - some hosts block framing outright (X-Frame-Options),
           with no error event. -->
      <div class="aspect-video w-full overflow-hidden rounded-lg" style="background: #000">
        <iframe
          v-bind="attrs"
          :title="item.label || kindLabel(item.kind)"
          class="w-full h-full border-0"
          loading="lazy"
          allowfullscreen
        />
      </div>
      <a :href="item.url" target="_blank" rel="noopener noreferrer" class="text-xs self-end hover:underline" style="color: var(--p-text-muted-color)">
        {{ t('media.openInstead') }} <i class="pi pi-external-link text-[0.65rem]" />
      </a>
    </template>
    <a
      v-else
      :href="item.url"
      target="_blank"
      rel="noopener noreferrer"
      v-tooltip.top="t('media.opensNewTab')"
      class="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg font-semibold text-sm"
      style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
    >
      <i class="pi pi-play" /> {{ item.label || kindLabel(item.kind) }}
    </a>
  </div>
</template>
