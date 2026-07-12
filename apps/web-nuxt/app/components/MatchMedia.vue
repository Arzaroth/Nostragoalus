<script setup lang="ts">
import { MATCH_MEDIA_KINDS, isValidStreamUrl, parseIframeEmbed, type MatchMediaKind } from '#shared/match-media'

const props = defineProps<{ matchId: string }>()
const { t } = useI18n()

const id = toRef(props, 'matchId')
const { data: media } = useMatchMedia(id)
const { add, remove } = useMatchMediaActions(id)

// Admin gate: this is the management panel only - the watch area itself lives in
// the match-view tabs (MatchMediaEmbed). useFetch is URL-keyed, so this shares
// the layout's /api/admin/status fetch instead of issuing a second request.
const { data: adminStatus } = useFetch<{ isAdmin: boolean }>('/api/admin/status')
const isAdmin = computed(() => adminStatus.value?.isAdmin === true)

function kindLabel(k: MatchMediaKind) {
  return t(`media.${k.toLowerCase()}`)
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
    v-if="isAdmin"
    class="rounded-2xl border p-4 sm:p-6 flex flex-col gap-3"
    style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">{{ t('media.admin') }}</h2>

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
  </section>
</template>
