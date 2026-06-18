<script setup lang="ts">
import type { MatchStatus } from '../../shared/types/match'
import {
  MATCH_MEDIA_KINDS,
  embedTargetFor,
  isValidStreamUrl,
  visibleMediaForStatus,
  type MatchMediaKind,
} from '../../shared/match-media'

const props = defineProps<{ matchId: string; status: MatchStatus }>()
const { t } = useI18n()

const id = toRef(props, 'matchId')
const { data: media } = useMatchMedia(id)
const { add, remove } = useMatchMediaActions(id)

// Admin gate drives only the management panel - the watch area is for everyone.
// useFetch is URL-keyed, so this shares the layout's /api/admin/status fetch
// instead of issuing a second request.
const { data: adminStatus } = useFetch<{ isAdmin: boolean }>('/api/admin/status')
const isAdmin = computed(() => adminStatus.value?.isAdmin === true)

// Twitch's player rejects an embed without a matching `parent` host; this works
// SSR and client.
const host = useRequestURL().host

const visible = computed(() => visibleMediaForStatus(media.value ?? [], props.status))

function kindLabel(k: MatchMediaKind) {
  return t(`media.${k.toLowerCase()}`)
}

// A recognised provider's player gets the player sandbox and keeps a same-origin
// referrer: some players (YouTube) validate the embedding origin from the Referer
// and otherwise fail with "Video player configuration error" (error 153), so we
// send the origin only via strict-origin-when-cross-origin (what YouTube's own
// embed code uses). An admin force-embedded raw host gets a strict sandbox (no
// allow-same-origin) and no referrer, so a hostile page can't reach our origin or
// learn where it was framed.
function embedAttrs(url: string): { src: string; sandbox: string; referrerpolicy: string } {
  const target = embedTargetFor(url, host)
  const trusted = target?.trusted ?? false
  return {
    src: target?.src ?? url,
    sandbox: trusted ? 'allow-scripts allow-same-origin allow-presentation' : 'allow-scripts allow-presentation',
    referrerpolicy: trusted ? 'strict-origin-when-cross-origin' : 'no-referrer',
  }
}

const form = reactive({ kind: 'LIVE' as MatchMediaKind, url: '', label: '', embed: 'auto' as 'auto' | 'embed' | 'off' })
const urlValid = computed(() => isValidStreamUrl(form.url))
const canAdd = computed(() => form.url.length > 0 && urlValid.value)

function submit() {
  if (!canAdd.value) return
  // 'auto' leaves the override null so the host whitelist decides.
  const embeddable = form.embed === 'auto' ? null : form.embed === 'embed'
  add.mutate(
    { kind: form.kind, url: form.url, label: form.label || undefined, embeddable },
    { onSuccess: () => { form.url = ''; form.label = '' } },
  )
}
</script>

<template>
  <section
    v-if="visible.length || isAdmin"
    class="rounded-2xl border p-4 sm:p-6 flex flex-col gap-4"
    style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
  >
    <h2 class="text-sm font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('media.watchTitle') }}</h2>

    <div v-for="item in visible" :key="item.id" class="flex flex-col gap-1.5">
      <template v-if="item.embeddable">
        <!-- Sandbox is per-host (see embedAttrs): trusted providers get the
             player sandbox, a force-embedded raw host gets a strict one. The link
             below is a permanent fallback - some hosts block framing outright
             (X-Frame-Options), with no error event. -->
        <div class="aspect-video w-full overflow-hidden rounded-lg" style="background: #000">
          <iframe
            v-bind="embedAttrs(item.url)"
            :title="item.label || kindLabel(item.kind)"
            class="w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            loading="lazy"
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

    <div v-if="isAdmin" class="flex flex-col gap-2 pt-3 border-t" style="border-color: var(--p-content-border-color)">
      <div class="text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('media.admin') }}</div>

      <div v-if="!media || !media.length" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('media.none') }}</div>
      <div v-for="item in media" :key="item.id" class="flex items-center gap-2 text-sm">
        <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background: var(--p-content-border-color)">{{ kindLabel(item.kind) }}</span>
        <span class="px-1.5 py-0.5 rounded text-xs" style="color: var(--p-text-muted-color)">{{ item.embeddable ? t('media.embeds') : t('media.linkOnly') }}</span>
        <span class="truncate flex-1" style="color: var(--p-text-muted-color)">{{ item.label || item.url }}</span>
        <button type="button" class="shrink-0 p-1 rounded hover:opacity-70" :aria-label="t('media.remove')" @click="remove.mutate(item.id)">
          <i class="pi pi-trash" style="color: var(--ng-danger)" />
        </button>
      </div>

      <form class="flex flex-col gap-2 mt-1" @submit.prevent="submit">
        <div class="flex gap-2 flex-wrap">
          <select v-model="form.kind" :aria-label="t('media.type')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
            <option v-for="k in MATCH_MEDIA_KINDS" :key="k" :value="k">{{ kindLabel(k) }}</option>
          </select>
          <select v-model="form.embed" :aria-label="t('media.embedding')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
            <option value="auto">{{ t('media.embedAuto') }}</option>
            <option value="embed">{{ t('media.embedForce') }}</option>
            <option value="off">{{ t('media.embedOff') }}</option>
          </select>
        </div>
        <input v-model="form.url" type="url" :placeholder="t('media.url')" :aria-label="t('media.url')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
        <input v-model="form.label" type="text" :placeholder="t('media.labelPlaceholder')" :aria-label="t('media.label')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
        <span v-if="form.url && !urlValid" class="text-xs" style="color: var(--ng-danger)">{{ t('media.invalidUrl') }}</span>
        <button
          type="submit"
          :disabled="!canAdd || add.isPending.value"
          class="self-start px-3 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
        >
          {{ t('media.add') }}
        </button>
      </form>
    </div>
  </section>
</template>
