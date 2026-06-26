<script setup lang="ts">
import { REACTION_EMOJIS, type ReactionEmoji } from '#shared/reactions'
import { ACCEPTED_IMAGE_TYPES } from '~/composables/useChatImage'
import type { DecryptedMessage } from '~/composables/useLeagueChat'
// End-to-end encrypted league chat. The league-global room (matchId null) or a
// per-match thread. All crypto is client-side; the server only relays ciphertext.
// `flat` drops the outer card chrome so the panel can sit inside the chat dock,
// which supplies its own window frame. `tall` grows the message list (the dock's
// expanded mode). `active` is false while the dock is collapsed - the list is
// hidden then, so we re-scroll to the bottom when it becomes visible again.
const props = withDefaults(
  defineProps<{ leagueId: string; matchId?: string | null; flat?: boolean; tall?: boolean; active?: boolean }>(),
  { matchId: null, flat: false, tall: false, active: true },
)

const { t } = useI18n()
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id ?? null)

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const chat = useLeagueChat(
  () => props.leagueId,
  () => props.matchId ?? null,
)
const { enabled, isAdmin, ready, awaitingKey, loading, sending, messages, memberKeys, muted, identityStatus } = chat

// Let a host (the floating dock) follow the live on/off state so it can show or
// hide itself the moment an admin toggles chat, without its own status fetch.
const emit = defineEmits<{ 'update:enabled': [boolean] }>()
watch(enabled, (v) => emit('update:enabled', v), { immediate: true })

// Emoji reactions, mirroring match reactions (one per member per message). The
// picker (all glyphs) opens for one message at a time.
const pickerFor = ref<string | null>(null)
function reactWith(messageId: string, emoji: ReactionEmoji) {
  pickerFor.value = null
  void chat.react(messageId, emoji)
}
function emojisWithCount(reactions: Record<ReactionEmoji, number>): ReactionEmoji[] {
  return REACTION_EMOJIS.filter((e) => reactions[e] > 0)
}

// Moderation: a removed message is a tombstone for all; a pending one is hidden
// from non-moderators. Moderators still see pending content so they can rule.
function contentVisible(m: DecryptedMessage): boolean {
  if (m.moderation === 'REMOVED') return false
  if (m.moderation === 'PENDING' && !isAdmin.value) return false
  return true
}

// Reports queue (owner/moderator), opened on demand.
const showReports = ref(false)
const reports = ref<Awaited<ReturnType<typeof chat.fetchReports>>>([])
const reportsLoading = ref(false)
async function openReports() {
  showReports.value = true
  reportsLoading.value = true
  try {
    reports.value = await chat.fetchReports()
  } finally {
    reportsLoading.value = false
  }
}
async function resolveReport(id: string, action: 'remove' | 'restore') {
  await chat.moderate(id, action)
  reports.value = reports.value.filter((r) => r.id !== id)
}
const { identity, hasRecovery, setupRecovery, restore } = useChatIdentity()

// Key verification: per-member safety numbers + trust-on-first-use pinning, so a
// substituted public key is caught.
const verify = useChatKeyVerification(memberKeys, computed(() => identity.value?.publicKey ?? null))
const { entries: keyEntries, myFingerprint, changedCount } = verify
const showVerify = ref(false)
const showMuted = ref(false)
// Show peers only; the caller's own number is shown once as "your safety number".
const peerEntries = computed(() => keyEntries.value.filter((e) => e.userId !== meId.value))

// Member names for display (the messages carry only user ids). Reuses the shared
// league-detail query so we don't re-fetch the roster the page already cached.
const detail = useLeagueDetail(computed<string | null>(() => props.leagueId))
const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  // Roster first, then chat members - so a participant hidden from the public
  // roster (but in this members-only chat) still shows their name, not "Someone".
  for (const m of detail.data.value?.members ?? []) map[m.userId] = m.name
  for (const m of memberKeys.value) if (m.name) map[m.userId] = m.name
  return map
})
function nameFor(uid: string | null): string {
  if (!uid) return t('chat.unknownUser')
  return names.value[uid] ?? t('chat.unknownUser')
}

// Reply: the message being answered. Its decrypted text is quoted above the
// composer and a compact preview is shown over the sent reply.
const replyTo = ref<DecryptedMessage | null>(null)
function startReply(m: DecryptedMessage) {
  replyTo.value = m
}

// Inline edit of your own message.
const editingId = ref<string | null>(null)
const editDraft = ref('')
function startEdit(m: DecryptedMessage) {
  editingId.value = m.id
  editDraft.value = m.text ?? ''
}
function cancelEdit() {
  editingId.value = null
}
async function saveEdit() {
  const id = editingId.value
  if (!id) return
  const text = editDraft.value
  editingId.value = null
  if (text.trim()) await chat.editMessage(id, text)
}
function parentOf(m: DecryptedMessage): DecryptedMessage | undefined {
  return m.parentId ? messages.value.find((x) => x.id === m.parentId) : undefined
}
// Quote text for a parent: a removed parent reads "message removed", not the
// generic can't-decrypt placeholder.
function quoteText(p: DecryptedMessage): string {
  if (p.moderation === 'REMOVED') return t('chat.moderation.removed')
  return p.text ?? t('chat.cantDecrypt')
}

const draft = ref('')
async function submit() {
  const text = draft.value
  const parentId = replyTo.value?.id ?? null
  draft.value = ''
  replyTo.value = null
  await chat.send(text, parentId)
}

// Images: drop, paste or pick. The current draft rides along as the caption and
// the reply target as the parent; rejected files (wrong type / too big) restore
// the draft so nothing is lost.
const acceptImages = ACCEPTED_IMAGE_TYPES.join(',')
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const imageError = ref(false)
async function sendImageFile(file: File) {
  const caption = draft.value
  const parentId = replyTo.value?.id ?? null
  draft.value = ''
  replyTo.value = null
  imageError.value = false
  const ok = await chat.sendImage(file, caption, parentId)
  if (!ok) {
    draft.value = caption
    imageError.value = true
  }
}
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void sendImageFile(file)
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'))
  if (file) void sendImageFile(file)
}
function onPaste(e: ClipboardEvent) {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (file) void sendImageFile(file)
}

// Enable flow (admins), behind the legal-cover warning.
const showWarning = ref(false)
const enabling = ref(false)
async function confirmEnable() {
  enabling.value = true
  try {
    await chat.enableChat()
    showWarning.value = false
    if (!hasRecovery.value) await openRecoverySetup()
  } finally {
    enabling.value = false
  }
}

// Recovery code (shown once).
const recoveryCode = ref<string | null>(null)
const showRecovery = ref(false)
const recoveryBusy = ref(false)
async function openRecoverySetup() {
  recoveryBusy.value = true
  try {
    recoveryCode.value = await setupRecovery()
    showRecovery.value = true
  } finally {
    recoveryBusy.value = false
  }
}
async function copyRecovery() {
  if (recoveryCode.value) await navigator.clipboard?.writeText(recoveryCode.value).catch(() => {})
}

// Restore on a new device.
const restoreCode = ref('')
const restoreError = ref(false)
const restoring = ref(false)
async function doRestore() {
  restoring.value = true
  restoreError.value = false
  try {
    await restore(restoreCode.value)
    await chat.load()
  } catch {
    restoreError.value = true
  } finally {
    restoring.value = false
  }
}

// Key rotation (admins): a fresh key for current members, revoking anyone removed.
const showRotate = ref(false)
const rotating = ref(false)
async function confirmRotate() {
  rotating.value = true
  try {
    await chat.rotateKey()
    showRotate.value = false
  } finally {
    rotating.value = false
  }
}

// Scroll handling: only follow the bottom when the reader is already there. New
// messages while scrolled up raise a "new messages" nudge instead of yanking the
// view down; in-place patches (reactions, mute, moderation) never scroll at all.
const listEl = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const hasNew = ref(false)
// Set on a room switch: the reload happens async, so we cannot scroll right away.
// The next time messages populate we force the view to the bottom, regardless of
// the (transient) scroll position the reload leaves behind.
const forceBottom = ref(false)
function onScroll() {
  const el = listEl.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  if (atBottom.value) hasNew.value = false
}
function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
    hasNew.value = false
  })
}
// React to count changes only (a real new message), not to every patch.
watch(
  () => messages.value.length,
  (n, prev) => {
    if (n <= prev) return
    if (forceBottom.value || atBottom.value) {
      forceBottom.value = false
      scrollToBottom()
    } else {
      hasNew.value = true
    }
  },
)
// Switching room (Global <-> Match) reloads the list: land at the latest, just
// like opening the chat does. Flag it; the reload's repopulate triggers the jump.
watch(
  () => props.matchId,
  () => {
    forceBottom.value = true
    hasNew.value = false
  },
)
// Becoming visible (the dock expands): the list had no height while hidden, so an
// earlier scroll-to-bottom did nothing. Jump now that it is laid out.
watch(
  () => props.active,
  (on) => {
    if (on) {
      forceBottom.value = true
      scrollToBottom()
    }
  },
  { immediate: true },
)

// Jump to a quoted parent and flash it, so a reply visibly references its post.
const flashId = ref<string | null>(null)
function jumpTo(id: string) {
  const el = listEl.value?.querySelector(`[data-mid="${id}"]`) as HTMLElement | null
  if (!el) return
  el.scrollIntoView({ block: 'center' })
  flashId.value = id
  setTimeout(() => {
    if (flashId.value === id) flashId.value = null
  }, 1200)
}
</script>

<template>
  <div
    class="flex flex-col gap-3"
    :class="props.flat ? '' : 'ng-card rounded-2xl border p-4'"
    :style="props.flat ? '' : 'background: var(--p-content-background); border-color: var(--p-content-border-color)'"
  >
    <div class="flex items-center gap-2">
      <i class="pi pi-lock" style="color: var(--p-primary-color)" />
      <span class="font-semibold">{{ props.matchId ? t('chat.threadTitle') : t('chat.roomTitle') }}</span>
      <span v-tooltip.top="t('chat.e2eeHint')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full" style="background: var(--ng-star-soft); color: var(--ng-star)">{{ t('chat.e2ee') }}</span>
      <span v-if="changedCount > 0" v-tooltip.top="t('chat.verify.changedWarn')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)"><i class="pi pi-exclamation-triangle text-[10px]" />{{ t('chat.verify.changed') }}</span>
    </div>

    <!-- This device has no key for an existing identity: restore. -->
    <div v-if="identityStatus === 'needs-restore'" class="flex flex-col gap-2 text-sm">
      <p style="color: var(--p-text-muted-color)">{{ t('chat.restore.body') }}</p>
      <InputText v-model="restoreCode" :placeholder="t('chat.restore.placeholder')" />
      <small v-if="restoreError" style="color: var(--ng-danger)">{{ t('chat.restore.error') }}</small>
      <Button :label="t('chat.restore.button')" :loading="restoring" size="small" @click="doRestore" />
    </div>

    <!-- Disabled. -->
    <div v-else-if="!enabled" class="text-sm flex flex-col gap-2" style="color: var(--p-text-muted-color)">
      <p>{{ t('chat.off') }}</p>
      <Button v-if="isAdmin" :label="t('chat.enable')" icon="pi pi-comments" size="small" @click="showWarning = true" />
    </div>

    <!-- Enabled. -->
    <template v-else>
      <div v-if="loading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.loading') }}</div>
      <div v-else-if="awaitingKey" class="text-sm flex flex-col gap-1" style="color: var(--p-text-muted-color)">
        <p class="inline-flex items-center gap-2"><i class="pi pi-spin pi-spinner text-xs" />{{ t('chat.awaitingKey') }}</p>
        <p class="text-xs opacity-80">{{ t('chat.awaitingKeyHint') }}</p>
      </div>
      <div v-else-if="!ready" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.settingUp') }}</div>
      <template v-else>
        <div class="relative">
        <div
          ref="listEl"
          class="relative flex flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain"
          :style="`max-height: ${props.tall ? '60vh' : '22rem'}`"
          @scroll="onScroll"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <div
            v-if="dragOver"
            class="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-semibold"
            style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 12%, var(--p-content-background))"
          >
            {{ t('chat.image.dropHere') }}
          </div>
          <p v-if="!messages.length" class="text-sm py-6 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.empty') }}</p>
          <div
            v-for="m in messages"
            :key="m.id"
            :data-mid="m.id"
            class="group text-sm flex flex-col rounded transition-colors min-w-0"
            :style="flashId === m.id ? 'background: color-mix(in srgb, var(--p-primary-color) 18%, transparent)' : ''"
          >
            <div class="flex items-center gap-2">
              <span class="font-semibold" :style="m.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(m.userId) }}</span>
              <span class="text-[10px]" style="color: var(--p-text-muted-color)">{{ fmtTime(m.createdAt) }}</span>
              <span v-if="m.editedAt" v-tooltip.bottom="t('chat.edit.at', { time: fmtTime(m.editedAt) })" class="text-[10px] italic" style="color: var(--p-text-muted-color)">{{ t('chat.edit.edited') }}</span>
              <span v-if="m.moderation === 'PENDING'" class="text-[10px] uppercase tracking-wider font-semibold px-1 rounded" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.moderation.pendingTag') }}</span>
              <!-- Per-message actions, icon-only, revealed on hover. -->
              <span v-if="m.moderation !== 'REMOVED'" class="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" v-tooltip.bottom="t('chat.reply.button')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.reply.button')" @click="startReply(m)"><i class="pi pi-reply text-xs" /></button>
                <button v-if="m.userId === meId" type="button" v-tooltip.bottom="t('chat.edit.button')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.edit.button')" @click="startEdit(m)"><i class="pi pi-pencil text-xs" /></button>
                <button v-if="m.userId && m.userId !== meId" type="button" v-tooltip.bottom="t('chat.mute')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.mute')" @click="chat.toggleMute(m.userId)"><i class="pi pi-volume-off text-xs" /></button>
                <button
                  v-if="m.userId && m.userId !== meId"
                  type="button"
                  v-tooltip.bottom="m.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')"
                  class="opacity-60 hover:opacity-100"
                  :aria-label="m.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')"
                  :style="m.reported ? 'color: var(--ng-danger)' : ''"
                  @click="chat.report(m.id)"
                ><i :class="m.reported ? 'pi pi-flag-fill' : 'pi pi-flag'" class="text-xs" /></button>
                <button v-if="isAdmin || m.userId === meId" type="button" v-tooltip.bottom="m.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" class="opacity-60 hover:opacity-100" :aria-label="m.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" style="color: var(--ng-danger)" @click="chat.moderate(m.id, 'remove')"><i class="pi pi-trash text-xs" /></button>
                <button v-if="isAdmin && m.moderation === 'PENDING'" type="button" v-tooltip.bottom="t('chat.moderation.restore')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.moderation.restore')" style="color: var(--p-primary-color)" @click="chat.moderate(m.id, 'restore')"><i class="pi pi-undo text-xs" /></button>
              </span>
            </div>
            <!-- Quoted parent: click to jump to the post this replies to. -->
            <button
              v-if="parentOf(m)"
              type="button"
              class="text-left text-xs rounded px-2 py-1 mb-0.5 border-l-2 opacity-80 hover:opacity-100 max-w-full overflow-hidden"
              style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-text-color) 5%, transparent)"
              @click="jumpTo(m.parentId!)"
            >
              <i class="pi pi-reply text-[10px] mr-1" style="color: var(--p-primary-color)" />
              <span class="font-semibold">{{ nameFor(parentOf(m)!.userId) }}</span>
              <span class="ml-1">{{ quoteText(parentOf(m)!) }}</span>
            </button>
            <span v-if="!contentVisible(m)" class="italic" style="color: var(--p-text-muted-color)">{{ m.moderation === 'REMOVED' ? t('chat.moderation.removed') : t('chat.moderation.pendingHidden') }}</span>
            <!-- Inline edit of your own message. -->
            <div v-else-if="editingId === m.id" class="flex flex-col gap-1">
              <Textarea v-model="editDraft" rows="1" autoResize class="w-full" @keydown.enter.exact.prevent="saveEdit" @keydown.esc="cancelEdit" />
              <div class="flex items-center gap-3 text-xs">
                <button type="button" class="underline" style="color: var(--p-primary-color)" @click="saveEdit">{{ t('chat.edit.save') }}</button>
                <button type="button" class="underline opacity-70 hover:opacity-100" @click="cancelEdit">{{ t('chat.edit.cancel') }}</button>
              </div>
            </div>
            <template v-else>
              <span v-if="m.text" class="break-words">{{ m.text }}</span>
              <span v-else-if="m.text === null && !m.hasAttachment" class="italic" style="color: var(--p-text-muted-color)">{{ t('chat.cantDecrypt') }}</span>
              <ChatImage v-if="m.hasAttachment" :load="() => chat.loadAttachment(m.id)" />
            </template>

            <!-- Reactions: existing counts plus a picker, mirroring match reactions. -->
            <div v-if="contentVisible(m)" class="flex flex-wrap items-center gap-1 mt-0.5">
              <button
                v-for="e in emojisWithCount(m.reactions)"
                :key="e"
                type="button"
                :aria-label="t(`reactions.label.${e}`)"
                :aria-pressed="m.myReaction === e"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs tabular-nums transition"
                :style="m.myReaction === e
                  ? 'border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 15%, transparent); color: var(--p-primary-color)'
                  : 'border-color: var(--p-content-border-color); color: var(--p-text-muted-color)'"
                @click="reactWith(m.id, e)"
              >
                <ReactionGlyph :emoji="e" />
                <span>{{ m.reactions[e] }}</span>
              </button>
              <div class="relative inline-flex">
                <button
                  type="button"
                  class="inline-flex items-center justify-center w-6 h-6 rounded-full opacity-50 hover:opacity-100"
                  :aria-label="t('chat.react.add')"
                  @click="pickerFor = pickerFor === m.id ? null : m.id"
                >
                  <i class="pi pi-face-smile text-xs" />
                </button>
                <div
                  v-if="pickerFor === m.id"
                  class="absolute bottom-7 left-0 z-10 flex items-center gap-1 p-1 rounded-full border shadow-lg"
                  style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
                >
                  <button
                    v-for="e in REACTION_EMOJIS"
                    :key="e"
                    type="button"
                    :aria-label="t(`reactions.label.${e}`)"
                    class="inline-flex items-center justify-center w-7 h-7 rounded-full hover:scale-110 transition-transform"
                    @click="reactWith(m.id, e)"
                  >
                    <ReactionGlyph :emoji="e" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
          <button
            v-if="hasNew"
            type="button"
            class="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-xs font-semibold px-3 py-1 rounded-full shadow-lg inline-flex items-center gap-1"
            style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
            @click="scrollToBottom"
          >
            {{ t('chat.newMessages') }}<i class="pi pi-arrow-down text-[10px]" />
          </button>
        </div>

        <div class="flex flex-col gap-1">
          <!-- Reply target preview, with a cancel. -->
          <div
            v-if="replyTo"
            class="flex items-center gap-2 text-xs rounded px-2 py-1 border-l-2"
            style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-text-color) 5%, transparent)"
          >
            <span class="opacity-70">{{ t('chat.reply.replyingTo', { name: nameFor(replyTo.userId) }) }}</span>
            <span class="truncate flex-1" style="color: var(--p-text-muted-color)">{{ replyTo.text ?? t('chat.cantDecrypt') }}</span>
            <button type="button" class="opacity-70 hover:opacity-100" :aria-label="t('chat.reply.cancel')" @click="replyTo = null"><i class="pi pi-times text-xs" /></button>
          </div>
          <small v-if="imageError" style="color: var(--ng-danger)">{{ t('chat.image.rejected') }}</small>
          <form class="flex items-end gap-2" @submit.prevent="submit">
            <input ref="fileInput" type="file" :accept="acceptImages" class="hidden" @change="onFilePicked">
            <Button type="button" icon="pi pi-image" severity="secondary" text :disabled="sending" :aria-label="t('chat.image.attach')" @click="fileInput?.click()" />
            <Textarea v-model="draft" :placeholder="t('chat.placeholder')" rows="1" autoResize class="flex-1" @keydown.enter.exact.prevent="submit" @paste="onPaste" />
            <Button type="submit" icon="pi pi-send" :loading="sending" :disabled="!draft.trim()" :aria-label="t('chat.send')" />
          </form>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100 inline-flex items-center gap-1" @click="showVerify = !showVerify">
              {{ t('chat.verify.show') }}
              <span v-if="changedCount > 0" style="color: var(--ng-danger)">({{ changedCount }})</span>
            </button>
            <button v-if="!hasRecovery" type="button" class="text-xs underline" style="color: var(--p-primary-color)" :disabled="recoveryBusy" @click="openRecoverySetup">{{ t('chat.setupRecovery') }}</button>
            <button v-if="muted.length" type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="showMuted = !showMuted">{{ t('chat.muted.show', { n: muted.length }) }}</button>
          </div>
          <div v-if="isAdmin" class="flex items-center gap-3">
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="openReports">{{ t('chat.moderation.queue') }}</button>
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="showRotate = true">{{ t('chat.rotate.button') }}</button>
            <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="chat.disableChat()">{{ t('chat.disable') }}</button>
          </div>
        </div>

        <!-- Safety-number verification: compare these out-of-band to detect a swapped key. -->
        <div v-if="showVerify" class="flex flex-col gap-2 text-sm border-t pt-3" style="border-color: var(--p-content-border-color)">
          <p style="color: var(--p-text-muted-color)">{{ t('chat.verify.intro') }}</p>
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold">{{ t('chat.verify.your') }}</span>
            <code class="font-mono text-xs break-all">{{ myFingerprint }}</code>
          </div>
          <p v-if="!peerEntries.length" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.verify.empty') }}</p>
          <div v-for="e in peerEntries" :key="e.userId" class="flex flex-col gap-1 border-t pt-2" style="border-color: var(--p-content-border-color)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold">{{ nameFor(e.userId) }}</span>
              <span v-if="e.changed" class="text-[10px] px-1.5 py-0.5 rounded-full" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.verify.changed') }}</span>
              <span v-else-if="e.verified" class="text-[10px] px-1.5 py-0.5 rounded-full" style="background: var(--ng-star-soft); color: var(--ng-star)">{{ t('chat.verify.verified') }}</span>
            </div>
            <code class="font-mono text-xs break-all" :style="e.changed ? 'color: var(--ng-danger)' : ''">{{ e.fingerprint }}</code>
            <div class="flex items-center gap-3">
              <button v-if="e.changed" type="button" class="text-xs underline" style="color: var(--ng-danger)" @click="verify.acknowledgeChange(e.userId)">{{ t('chat.verify.acknowledge') }}</button>
              <button v-if="!e.verified" type="button" class="text-xs underline" style="color: var(--p-primary-color)" @click="verify.markVerified(e.userId)">{{ t('chat.verify.markVerified') }}</button>
            </div>
          </div>
        </div>

        <!-- Muted members: local-only, so this is the one place to unmute them. -->
        <div v-if="showMuted && muted.length" class="flex flex-col gap-2 text-sm border-t pt-3" style="border-color: var(--p-content-border-color)">
          <p style="color: var(--p-text-muted-color)">{{ t('chat.muted.intro') }}</p>
          <div v-for="uid in muted" :key="uid" class="flex items-center justify-between gap-2">
            <span class="font-semibold">{{ nameFor(uid) }}</span>
            <button type="button" class="text-xs underline" style="color: var(--p-primary-color)" @click="chat.toggleMute(uid)">{{ t('chat.muted.unmute') }}</button>
          </div>
        </div>
      </template>
    </template>

    <!-- Legal-cover warning before enabling. -->
    <Dialog v-model:visible="showWarning" modal :header="t('chat.warning.title')" :style="{ width: '32rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-3 text-sm">
        <p>{{ t('chat.warning.body1') }}</p>
        <p>{{ t('chat.warning.body2') }}</p>
        <p style="color: var(--ng-danger)">{{ t('chat.warning.body3') }}</p>
      </div>
      <template #footer>
        <Button :label="t('chat.warning.cancel')" severity="secondary" text @click="showWarning = false" />
        <Button :label="t('chat.warning.confirm')" :loading="enabling" @click="confirmEnable" />
      </template>
    </Dialog>

    <!-- Rotate-key confirm (admins). -->
    <Dialog v-model:visible="showRotate" modal :header="t('chat.rotate.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <p class="text-sm">{{ t('chat.rotate.body') }}</p>
      <template #footer>
        <Button :label="t('chat.rotate.cancel')" severity="secondary" text @click="showRotate = false" />
        <Button :label="t('chat.rotate.confirm')" :loading="rotating" @click="confirmRotate" />
      </template>
    </Dialog>

    <!-- Reports queue (owner/moderator): read each, then keep or remove. -->
    <Dialog v-model:visible="showReports" modal :header="t('chat.moderation.queueTitle')" :style="{ width: '34rem', maxWidth: '92vw' }">
      <div v-if="reportsLoading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.loading') }}</div>
      <p v-else-if="!reports.length" class="text-sm py-4 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.moderation.empty') }}</p>
      <div v-else class="flex flex-col gap-3">
        <div v-for="r in reports" :key="r.id" class="flex flex-col gap-1 border-b pb-2 text-sm" style="border-color: var(--p-content-border-color)">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold">{{ nameFor(r.userId) }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.moderation.reportCount', { n: r.reports }) }}</span>
            <span v-if="r.moderation === 'PENDING'" class="text-[10px] uppercase tracking-wider" style="color: var(--ng-danger)">{{ t('chat.moderation.pendingTag') }}</span>
          </div>
          <span class="break-words">{{ r.text ?? t('chat.cantDecrypt') }}</span>
          <div class="flex items-center gap-3">
            <button type="button" class="text-xs underline" style="color: var(--p-primary-color)" @click="resolveReport(r.id, 'restore')">{{ t('chat.moderation.ignore') }}</button>
            <button type="button" class="text-xs underline" style="color: var(--ng-danger)" @click="resolveReport(r.id, 'remove')">{{ t('chat.moderation.confirm') }}</button>
          </div>
        </div>
      </div>
      <template #footer>
        <Button :label="t('chat.moderation.done')" severity="secondary" text @click="showReports = false" />
      </template>
    </Dialog>

    <!-- Recovery code, shown once. -->
    <Dialog v-model:visible="showRecovery" modal :header="t('chat.recovery.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-3 text-sm">
        <p>{{ t('chat.recovery.body') }}</p>
        <code class="block p-3 rounded-lg text-center font-mono break-all" style="background: var(--p-content-background); border: 1px solid var(--p-content-border-color)">{{ recoveryCode }}</code>
        <Button :label="t('chat.recovery.copy')" icon="pi pi-copy" severity="secondary" size="small" @click="copyRecovery" />
      </div>
      <template #footer>
        <Button :label="t('chat.recovery.saved')" @click="showRecovery = false" />
      </template>
    </Dialog>
  </div>
</template>
