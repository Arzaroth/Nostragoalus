<script setup lang="ts">
import type { MatchStatus } from '../../shared/types/match'
import {
  MATCH_MEDIA_KINDS,
  isValidStreamUrl,
  parseIframeEmbed,
  resolveEmbedAttrs,
  visibleMediaForStatus,
  type MatchMediaItem,
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

// Final iframe attributes per link: resolveEmbedAttrs picks the provider player
// src, the sandbox (per-trust default, or the admin's force-on / off override -
// off emits no sandbox attribute, for hosts that refuse it), the allow policy and
// the referrer policy (a recognised player keeps a same-origin referrer so it can
// authorise the embed - YouTube otherwise fails with "configuration error" 153).
// A `sandbox` of undefined drops the attribute entirely (v-bind omits it).
function embedAttrs(item: MatchMediaItem) {
  return resolveEmbedAttrs(item, host)
}

const form = reactive({
  kind: 'LIVE' as MatchMediaKind,
  url: '',
  label: '',
  embed: 'auto' as 'auto' | 'embed' | 'off',
  // sandbox: auto = per-trust default, on = force the player sandbox, off = none.
  sandbox: 'auto' as 'auto' | 'on' | 'off',
  allow: '',
})
const urlValid = computed(() => isValidStreamUrl(form.url))
const canAdd = computed(() => form.url.length > 0 && urlValid.value)

// Paste a provider's "<iframe ...>" tag straight into the URL field: pull out the
// src (and its allow policy) and keep just those, so the admin doesn't hand-strip
// the tag. A plain URL is left untouched.
watch(
  () => form.url,
  (v) => {
    const parsed = parseIframeEmbed(v)
    if (!parsed) return
    form.url = parsed.url
    if (parsed.allow) form.allow = parsed.allow
  },
)

function submit() {
  if (!canAdd.value) return
  // 'auto' leaves the override null so the host whitelist decides.
  const embeddable = form.embed === 'auto' ? null : form.embed === 'embed'
  const sandbox = form.sandbox === 'auto' ? null : form.sandbox === 'on'
  add.mutate(
    { kind: form.kind, url: form.url, label: form.label || undefined, embeddable, sandbox, allow: form.allow || null },
    {
      onSuccess: () => {
        form.url = ''
        form.label = ''
        form.allow = ''
        form.embed = 'auto'
        form.sandbox = 'auto'
      },
    },
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
            v-bind="embedAttrs(item)"
            :title="item.label || kindLabel(item.kind)"
            class="w-full h-full border-0"
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
        <span v-if="item.embeddable && item.sandbox === false" v-tooltip.top="t('media.unsandboxedHint')" class="px-1.5 py-0.5 rounded text-xs font-medium" style="color: var(--ng-danger)">{{ t('media.unsandboxed') }}</span>
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
        <input v-model="form.url" type="text" inputmode="url" :placeholder="t('media.urlOrIframe')" :aria-label="t('media.url')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
        <input v-model="form.label" type="text" :placeholder="t('media.labelPlaceholder')" :aria-label="t('media.label')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
        <span v-if="form.url && !urlValid" class="text-xs" style="color: var(--ng-danger)">{{ t('media.invalidUrl') }}</span>
        <!-- Iframe sandboxing: a recognised player is auto-sandboxed; some hosts
             (certain PPV players) refuse to run sandboxed, so an admin can drop it,
             at the cost of letting that page navigate or pop up within our frame. -->
        <div class="flex gap-2 flex-wrap items-center">
          <label class="text-xs" style="color: var(--p-text-muted-color)">{{ t('media.sandbox') }}</label>
          <select v-model="form.sandbox" :aria-label="t('media.sandbox')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
            <option value="auto">{{ t('media.sandboxAuto') }}</option>
            <option value="on">{{ t('media.sandboxOn') }}</option>
            <option value="off">{{ t('media.sandboxOff') }}</option>
          </select>
        </div>
        <span v-if="form.sandbox === 'off'" class="text-xs" style="color: #eab308">{{ t('media.sandboxOffWarning') }}</span>
        <input v-model="form.allow" type="text" :placeholder="t('media.allowPlaceholder')" :aria-label="t('media.allow')" class="rounded-lg border px-2 py-1.5 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)" >
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
