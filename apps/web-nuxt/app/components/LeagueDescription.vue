<script setup lang="ts">
import { downscaleToWebpDataUrl } from '../utils/image'

const props = defineProps<{ leagueId: string; description: string | null | undefined; canManage: boolean }>()
const { t } = useI18n()
const { update } = useLeagueActions()

const rendered = computed(() => renderMarkdown(props.description))

const editing = ref(false)
const draft = ref('')
const preview = computed(() => renderMarkdown(draft.value))
const uploading = ref(false)
const uploadError = ref('')

function openEdit() {
  draft.value = props.description ?? ''
  uploadError.value = ''
  editing.value = true
}

async function onImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  const input = e.target as HTMLInputElement
  if (!file) return
  uploadError.value = ''
  uploading.value = true
  try {
    // Downscale + re-encode client-side; the raw file (multi-MB) blows past the
    // server's 512KB reward-store cap and 422s.
    const dataUrl = await downscaleToWebpDataUrl(file)
    const { url } = await $fetch<{ url: string }>(`/api/leagues/${props.leagueId}/description-image`, {
      method: 'POST',
      body: { imageDataUrl: dataUrl },
    })
    // Append the uploaded image as a markdown image the author can reposition.
    draft.value = `${draft.value}${draft.value ? '\n\n' : ''}![](${url})\n`
  } catch (err: unknown) {
    uploadError.value = (err as { data?: { message?: string } })?.data?.message ?? t('leagueDesc.uploadFailed')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function submit() {
  await update.mutateAsync({ leagueId: props.leagueId, description: draft.value.trim() || null })
  editing.value = false
}
</script>

<template>
  <section v-if="rendered || canManage" class="mt-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-bold">{{ t('leagueDesc.title') }}</h3>
      <Button
        v-if="canManage"
        size="small"
        severity="secondary"
        icon="pi pi-pencil"
        :label="rendered ? t('leagueDesc.edit') : t('leagueDesc.add')"
        @click="openEdit"
      />
    </div>

    <!-- Rendered markdown is sanitized in renderMarkdown (untrusted author input). -->
    <div
      v-if="rendered"
      class="ng-markdown ng-card rounded-xl border p-4"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
      v-html="rendered"
    />
    <p v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('leagueDesc.empty') }}</p>

    <Dialog v-model:visible="editing" modal :header="t('leagueDesc.title')" class="w-[95vw] max-w-2xl">
      <div class="flex flex-col gap-3">
        <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('leagueDesc.hint') }}</p>
        <textarea
          v-model="draft"
          :aria-label="t('leagueDesc.title')"
          rows="8"
          class="w-full rounded-lg border px-3 py-2 text-sm font-mono"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          :placeholder="t('leagueDesc.placeholder')"
        />
        <div class="flex items-center gap-3">
          <label class="text-xs cursor-pointer hover:underline inline-flex items-center gap-1" style="color: var(--p-primary-color)">
            <i class="pi pi-image" /> {{ uploading ? t('leagueDesc.uploading') : t('leagueDesc.addImage') }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onImage" >
          </label>
          <span v-if="uploadError" class="text-xs" style="color: var(--ng-danger)">{{ uploadError }}</span>
        </div>

        <div v-if="preview">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--p-text-muted-color)">{{ t('leagueDesc.preview') }}</div>
          <div class="ng-markdown rounded-lg border p-3" style="border-color: var(--p-content-border-color)" v-html="preview" />
        </div>
      </div>
      <template #footer>
        <Button severity="secondary" :label="t('common.cancel')" @click="editing = false" />
        <Button :label="t('common.save')" icon="pi pi-check" :loading="update.isPending.value" @click="submit" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.ng-markdown :deep(h1),
.ng-markdown :deep(h2),
.ng-markdown :deep(h3),
.ng-markdown :deep(h4) {
  font-weight: 700;
  line-height: 1.25;
  margin: 0.6em 0 0.3em;
}
.ng-markdown :deep(h1) { font-size: 1.4rem; }
.ng-markdown :deep(h2) { font-size: 1.2rem; }
.ng-markdown :deep(h3) { font-size: 1.05rem; }
.ng-markdown :deep(p) { margin: 0.4em 0; }
.ng-markdown :deep(ul),
.ng-markdown :deep(ol) { margin: 0.4em 0; padding-inline-start: 1.4em; }
.ng-markdown :deep(ul) { list-style: disc; }
.ng-markdown :deep(ol) { list-style: decimal; }
.ng-markdown :deep(a) { color: var(--p-primary-color); text-decoration: underline; }
.ng-markdown :deep(img) { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 0.4em 0; }
.ng-markdown :deep(blockquote) {
  border-inline-start: 3px solid var(--p-content-border-color);
  padding-inline-start: 0.8em;
  color: var(--p-text-muted-color);
  margin: 0.4em 0;
}
.ng-markdown :deep(code) {
  font-family: monospace;
  background: var(--p-content-border-color);
  padding: 0.05em 0.3em;
  border-radius: 0.25rem;
}
.ng-markdown :deep(pre) {
  background: var(--p-content-border-color);
  padding: 0.6em;
  border-radius: 0.5rem;
  overflow-x: auto;
}
.ng-markdown :deep(pre code) { background: transparent; padding: 0; }
.ng-markdown :deep(hr) { border: 0; border-top: 1px solid var(--p-content-border-color); margin: 0.8em 0; }
</style>
