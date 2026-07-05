<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { REACTION_EMOJIS, type ReactionEmoji } from '#shared/reactions'
import { MAX_MESSAGE_TEXT_LENGTH } from '#shared/types/chat'
import { decodeMentions, encodeMentions, extractMentions } from '~/utils/chat-content'
import { ACCEPTED_IMAGE_TYPES, compressToWebp, imageMimeForBytes } from '~/composables/useChatImage'
import { DEFAULT_COMPETITION } from '#shared/competition'
import type { DecryptedMessage, PendingImage } from '~/composables/useLeagueChat'
// End-to-end encrypted chat. Drives either a league room (the league-global room
// with matchId null, or a per-match thread) or, when `dmThreadId` is set, a single
// two-person DM thread as just another room. All crypto is client-side; the server
// only relays ciphertext. `flat` drops the outer card chrome so the panel can sit
// inside the chat dock, which supplies its own window frame. `tall` grows the
// message list (the dock's expanded mode). `active` is false while the dock is
// collapsed - the list is hidden then, so we re-scroll to the bottom when it
// becomes visible again.
const props = withDefaults(
  defineProps<{ leagueId?: string; matchId?: string | null; matchLabel?: string; flat?: boolean; tall?: boolean; active?: boolean; dmThreadId?: string }>(),
  { matchId: null, matchLabel: '', flat: false, tall: false, active: true },
)
const isDm = computed(() => !!props.dmThreadId)

// Up to this many images on one message (mirrors the server cap).
const MAX_IMAGES = 6

const { t } = useI18n()
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id ?? null)
const slug = useSelectedCompetition()

// A chat author's profile page (same destination as a leaderboard row), or null
// when there is no competition context (the global dock with nothing selected). A
// DM has no competition of its own, so fall back to the default one - the profile
// page is the same person wherever it opens, and a dead link would be worse.
function profileLink(uid: string | null): string | null {
  const s = slug.value ?? (isDm.value ? DEFAULT_COMPETITION : null)
  return uid && s ? `/${s}/users/${uid}` : null
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Full date + time for the timestamp's hover tooltip (the inline label is just HH:MM).
function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

// One mode for the panel's life: the dock keys/remounts this component on a mode
// switch, so this conditional call at setup is safe. Both composables expose the
// same surface, so the rest of the panel is mode-agnostic.
const chat = props.dmThreadId
  ? useDmRoom(() => props.dmThreadId!)
  : useLeagueChat(() => props.leagueId!, () => props.matchId ?? null)
const { enabled, isAdmin, ready, awaitingKey, loading, sending, readMarker, hasMore, loadingOlder, typingUserIds, messages, memberKeys, muted, identityStatus } = chat

// Let a host (the floating dock) follow the live on/off state so it can show or
// hide itself the moment an admin toggles chat, without its own status fetch.
// `readable` = the room is loaded AND decrypted; the dock gates its read receipt
// on it so a room we cannot decrypt is never silently marked read.
const emit = defineEmits<{ 'update:enabled': [boolean]; 'update:readable': [boolean] }>()
watch(enabled, (v) => emit('update:enabled', v), { immediate: true })
const readable = computed(() => ready.value && !loading.value)
watch(readable, (v) => emit('update:readable', v), { immediate: true })

// The first message the reader has not seen (newer than their frozen read marker,
// and not their own), for the "new messages" divider. Stable as live messages
// append, because the marker is frozen at room-open; clears when nothing is new.
const firstUnreadId = computed<string | null>(() => {
  const marker = readMarker.value
  if (!marker) return null
  return messages.value.find((m) => m.userId !== meId.value && m.createdAt > marker)?.id ?? null
})

// Emoji reactions, mirroring match reactions (one per member per message). The
// picker (all glyphs) opens for one message at a time.
const pickerFor = ref<string | null>(null)
// Overflow (kebab) menu under the chat: verify, key backup, admin actions.
const menuOpen = ref(false)
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
// league-detail query so we don't re-fetch the roster the page already cached. In
// DM mode there is no league detail (query inert); names+avatars come solely from
// the two-person roster on memberKeys.
const detail = useLeagueDetail(computed<string | null>(() => (isDm.value ? null : props.leagueId ?? null)))
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
const avatars = computed<Record<string, string | null>>(() => {
  const map: Record<string, string | null> = {}
  for (const m of detail.data.value?.members ?? []) map[m.userId] = m.image
  // DM roster carries avatars on memberKeys (no league detail to draw from).
  for (const m of memberKeys.value) {
    const img = (m as { image?: string | null }).image
    if (img != null) map[m.userId] = img
  }
  return map
})
function avatarFor(uid: string | null): string | null {
  return uid ? avatars.value[uid] ?? null : null
}
// The other DM participant, for the lightbox title (a DM has no league name).
const otherName = computed(() => memberKeys.value.find((m) => m.userId !== meId.value)?.name ?? '')
const leagueName = computed(() => (isDm.value ? otherName.value : detail.data.value?.league?.name ?? ''))

// Copy a message's text to the clipboard (the text component only, not images).
function copyText(m: DecryptedMessage) {
  if (m.text) void navigator.clipboard?.writeText(m.text).catch(() => {})
}

// "Someone is typing" hint for the current room.
const typingText = computed(() => {
  const who = typingUserIds.value.map(nameFor)
  if (who.length === 0) return ''
  if (who.length === 1) return t('chat.typing.one', { name: who[0] })
  if (who.length === 2) return t('chat.typing.two', { a: who[0], b: who[1] })
  return t('chat.typing.many', { n: who.length })
})
// A subtle SMS-style bubble: your own messages tinted with the brand colour, the
// rest neutral, so consecutive posts read as distinct.
function bubbleStyle(m: DecryptedMessage): string {
  return m.userId === meId.value
    ? 'background: color-mix(in srgb, var(--p-primary-color) 16%, var(--p-content-background)); border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent)'
    : 'background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background)); border: 1px solid var(--p-content-border-color)'
}

// Shared image lightbox: a list of {messageId, idx, epoch} plus an index. Opened
// from a message's thumbnails (that message's images) or from the media gallery
// button (every image in the room).
const lbVisible = ref(false)
const lbItems = ref<{ messageId: string; idx: number; epoch: number }[]>([])
const lbIndex = ref(0)
function openMessageImages(m: DecryptedMessage, startIdx: number) {
  lbItems.value = m.attachments.map((a) => ({ messageId: m.id, idx: a.idx, epoch: a.epoch }))
  const at = m.attachments.findIndex((a) => a.idx === startIdx)
  lbIndex.value = at < 0 ? 0 : at
  lbVisible.value = true
}
const mediaLoading = ref(false)
async function openMedia() {
  mediaLoading.value = true
  try {
    const media = await chat.roomMedia()
    if (!media.length) return
    lbItems.value = media.map((x) => ({ messageId: x.messageId, idx: x.idx, epoch: x.epoch }))
    lbIndex.value = 0
    lbVisible.value = true
  } finally {
    mediaLoading.value = false
  }
}

// Quote-reply: the message being answered, quoted above the composer; sent with
// parentId and rendered as an inline quote in the main list (it stays there).
const replyTo = ref<DecryptedMessage | null>(null)
function startReply(m: DecryptedMessage) {
  replyTo.value = m
  nextTick(() => composerTextarea()?.focus())
}
function parentOf(m: DecryptedMessage): DecryptedMessage | undefined {
  return m.parentId ? messages.value.find((x) => x.id === m.parentId) : undefined
}
// A one-line plaintext preview of a message (reply banner, quoted parent, reports
// queue): decode `@<id>` mentions to `@Name` so a quoted mention reads as the name,
// not the raw id. Null text is an undecryptable message.
function previewText(text: string | null): string {
  return text === null ? t('chat.cantDecrypt') : decodeMentions(text, names.value, t('chat.unknownUser'))
}
// Quote text for a parent: a removed parent reads "message removed", not the
// generic can't-decrypt placeholder.
function quoteText(p: DecryptedMessage): string {
  if (p.moderation === 'REMOVED') return t('chat.moderation.removed')
  return previewText(p.text)
}

// Threads (a separate relation from quotes): thread replies live in a message's
// thread, NOT the main list. Opening a thread loads its replies and reveals an
// inline reply composer that posts with threadId.
const { threadParentId, threadMessages, threadLoading } = chat
const threadDraft = ref('')
const threadOverLimit = computed(() => threadDraft.value.length > MAX_MESSAGE_TEXT_LENGTH)
function openThreadFor(m: DecryptedMessage) {
  void chat.openThread(m.id)
  nextTick(() => {
    const ta = listEl.value?.querySelector(`[data-thread="${m.id}"] textarea`) as HTMLTextAreaElement | null
    ta?.focus()
  })
}
async function submitThreadReply() {
  const threadId = threadParentId.value
  if (!threadId || !threadDraft.value.trim() || threadOverLimit.value) return
  const text = encodeMentions(threadDraft.value, detail.data.value?.members ?? [])
  threadDraft.value = ''
  threadScrolls.value = false
  await chat.send(text, { threadId, mentions: extractMentions(text) })
}
// Scroll to the message a quote points at.
function jumpTo(id: string) {
  const el = listEl.value?.querySelector(`[data-mid="${id}"]`) as HTMLElement | null
  el?.scrollIntoView({ block: 'center' })
}

// Inline edit of your own message: the text plus the ability to drop existing
// images (toggle) and append new buffered ones - the same "edited" state covers a
// changed image set as it does changed text.
interface ExistingEdit {
  idx: number
  epoch: number
  url: string | null
  removed: boolean
}
const editingId = ref<string | null>(null)
const editDraft = ref('')
const editExisting = ref<ExistingEdit[]>([])
const editAdd = ref<PendingImage[]>([])
const editAddUrls = ref<string[]>([])

function revokeEditUrls() {
  for (const e of editExisting.value) if (e.url) URL.revokeObjectURL(e.url)
  for (const u of editAddUrls.value) URL.revokeObjectURL(u)
  editAddUrls.value = []
}
function startEdit(m: DecryptedMessage) {
  revokeEditUrls()
  editingId.value = m.id
  editDraft.value = decodeMentions(m.text ?? '', names.value, t('chat.unknownUser'))
  editAdd.value = []
  editExisting.value = m.attachments.map((a) => ({ idx: a.idx, epoch: a.epoch, url: null, removed: false }))
  // Load each existing image's preview (decrypted locally) for the remove toggles.
  for (const a of m.attachments) {
    void chat.loadAttachment(m.id, a.idx, a.epoch).then((bytes) => {
      if (!bytes || editingId.value !== m.id) return
      const e = editExisting.value.find((x) => x.idx === a.idx)
      if (e) e.url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMimeForBytes(bytes) }))
    })
  }
  // Focus the edit field so the user can type right away. The edit box lives
  // inside the v-for, so its template ref would be an array - query the DOM by the
  // message id instead.
  nextTick(() => {
    const ta = listEl.value?.querySelector(`[data-mid="${m.id}"] textarea`) as HTMLTextAreaElement | null
    ta?.focus()
    editScrolls.value = capScroll(ta)
  })
}
function cancelEdit() {
  revokeEditUrls()
  editingId.value = null
}
// Up-arrow editing, like a terminal history: from the empty composer, jump
// straight into editing your most recent message; while editing, walk back to
// the previous one (and off the top, close the editor). Only your own still-
// visible messages are editable, so those are what we step through.
function myEditable(): DecryptedMessage[] {
  return messages.value.filter((m) => m.userId === meId.value && m.moderation === 'VISIBLE')
}
function onComposerUp(e: KeyboardEvent) {
  if (draft.value) return // typing: let the caret move through the draft
  const list = myEditable()
  const last = list[list.length - 1]
  if (!last) return
  e.preventDefault()
  startEdit(last)
}
function onEditUp(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement
  // Only hijack Up at the very start of the field, so multi-line editing still
  // navigates within the text.
  if (ta.selectionStart !== 0 || ta.selectionEnd !== 0) return
  const list = myEditable()
  const i = list.findIndex((m) => m.id === editingId.value)
  e.preventDefault()
  if (i > 0) startEdit(list[i - 1])
  else cancelEdit()
}
function onEditDown(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement
  // Only hijack Down at the very end of the field. Past the newest message, close
  // the editor and drop back into the composer.
  if (ta.selectionStart !== ta.value.length || ta.selectionEnd !== ta.value.length) return
  const list = myEditable()
  const i = list.findIndex((m) => m.id === editingId.value)
  e.preventDefault()
  if (i >= 0 && i < list.length - 1) startEdit(list[i + 1])
  else {
    cancelEdit()
    nextTick(() => composerTextarea()?.focus())
  }
}
function toggleRemoveExisting(idx: number) {
  const e = editExisting.value.find((x) => x.idx === idx)
  if (e) e.removed = !e.removed
}
const editKept = computed(() => editExisting.value.filter((e) => !e.removed).length + editAdd.value.length)
async function onEditFiles(files: File[]) {
  for (const file of files) {
    if (editKept.value >= MAX_IMAGES) break
    const compressed = await compressToWebp(file)
    if (!compressed) {
      imageError.value = true
      continue
    }
    editAdd.value = [...editAdd.value, { bytes: compressed.bytes, byteSize: compressed.byteSize }]
    editAddUrls.value = [...editAddUrls.value, URL.createObjectURL(new Blob([compressed.bytes as BlobPart], { type: imageMimeForBytes(compressed.bytes) }))]
  }
}
function removeEditAdd(i: number) {
  const url = editAddUrls.value[i]
  if (url) URL.revokeObjectURL(url)
  editAdd.value = editAdd.value.filter((_, j) => j !== i)
  editAddUrls.value = editAddUrls.value.filter((_, j) => j !== i)
}
const editFileInput = ref<HTMLInputElement | null>(null)
function onEditFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  void onEditFiles(imageFilesFrom(input.files))
  input.value = ''
}
async function saveEdit() {
  const id = editingId.value
  if (!id) return
  const removeIdxs = editExisting.value.filter((e) => e.removed).map((e) => e.idx)
  // A message must keep some content: text, a surviving image or a new one.
  if (!editDraft.value.trim() && editKept.value === 0) return
  if (editOverLimit.value) return
  const text = encodeMentions(editDraft.value, detail.data.value?.members ?? [])
  const addImages = editAdd.value
  revokeEditUrls()
  editingId.value = null
  await chat.editMessage(id, text, { addImages, removeIdxs })
}

const draft = ref('')
// Plaintext length cap, enforced client-side (the server only sees ciphertext):
// past it the composer/edit blocks the send and the counter turns red.
const overLimit = computed(() => draft.value.length > MAX_MESSAGE_TEXT_LENGTH)
const editOverLimit = computed(() => editDraft.value.length > MAX_MESSAGE_TEXT_LENGTH)
const composer = ref<{ $el?: HTMLElement } | null>(null)
function composerTextarea(): HTMLTextAreaElement | null {
  // A PrimeVue Textarea's $el is the <textarea> itself (no nested one).
  const el = composer.value?.$el as HTMLElement | undefined
  return (el?.tagName === 'TEXTAREA' ? el : el?.querySelector?.('textarea')) as HTMLTextAreaElement | null
}
// The thread and edit fields live inside the message v-for, so their template refs
// would be arrays - reach them through the DOM by the open thread/edit id instead,
// the same way startEdit/openThreadFor already focus them.
function threadTextarea(): HTMLTextAreaElement | null {
  const id = threadParentId.value
  return id ? (listEl.value?.querySelector(`[data-thread="${id}"] textarea`) as HTMLTextAreaElement | null) : null
}
function editTextarea(): HTMLTextAreaElement | null {
  const id = editingId.value
  return id ? (listEl.value?.querySelector(`[data-mid="${id}"] textarea`) as HTMLTextAreaElement | null) : null
}

// The autoResize textareas grow to fit, then cap at ~3 lines. We only switch on
// the scrollbar once the content actually exceeds that cap: leaving overflow:auto
// on always shows a perpetual scrollbar (the field's border makes the content a
// couple px taller than the auto-sized height). `scrollHeight` is content-based,
// so this reads true regardless of when autoResize set the height.
const TEXTAREA_CAP_PX = 120
const composerScrolls = ref(false)
const editScrolls = ref(false)
const threadScrolls = ref(false)
function capScroll(ta: HTMLTextAreaElement | null): boolean {
  return !!ta && ta.scrollHeight > TEXTAREA_CAP_PX
}

// Emoji quick-insert: splice the glyph in at the caret (replacing any selection)
// and restore focus just after it, so the user can keep typing or add more.
const emojiOpen = ref(false)
function insertEmoji(emoji: string) {
  const ta = composerTextarea()
  if (!ta) {
    draft.value += emoji
    return
  }
  const start = ta.selectionStart ?? draft.value.length
  const end = ta.selectionEnd ?? draft.value.length
  draft.value = draft.value.slice(0, start) + emoji + draft.value.slice(end)
  nextTick(() => {
    ta.focus()
    const pos = start + emoji.length
    ta.setSelectionRange(pos, pos)
  })
}

// @mention autocomplete: when the caret sits in an `@partial` run, offer matching
// league members; picking inserts the display name (encodeMentions maps it back to
// a stable `@<id>` token at send time). The same popup serves the main composer, a
// thread reply and an inline edit - `mentionTarget` tracks which field is active so
// only that field shows the dropdown and receives the insertion. Arrow/Enter/Tab/
// Escape drive it from that field's keydown.
type MentionTarget = 'composer' | 'thread' | 'edit'
interface MentionField {
  get(): string
  set(v: string): void
  ta(): HTMLTextAreaElement | null
}
const mentionFields: Record<MentionTarget, MentionField> = {
  composer: { get: () => draft.value, set: (v) => { draft.value = v }, ta: composerTextarea },
  thread: { get: () => threadDraft.value, set: (v) => { threadDraft.value = v }, ta: threadTextarea },
  edit: { get: () => editDraft.value, set: (v) => { editDraft.value = v }, ta: editTextarea },
}
const mentionTarget = ref<MentionTarget>('composer')
const mentionQuery = ref<string | null>(null)
const mentionStart = ref(0)
const mentionIndex = ref(0)
const mentionCandidates = computed(() => {
  if (mentionQuery.value === null) return []
  const q = mentionQuery.value.toLowerCase()
  return (detail.data.value?.members ?? []).filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6)
})
function detectMention(target: MentionTarget) {
  mentionTarget.value = target
  const f = mentionFields[target]
  const ta = f.ta()
  if (!ta) {
    mentionQuery.value = null
    return
  }
  const text = f.get()
  const caret = ta.selectionStart ?? text.length
  const m = text.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
  if (m) {
    mentionQuery.value = m[1]!
    mentionStart.value = caret - m[1]!.length - 1
    mentionIndex.value = 0
  } else {
    mentionQuery.value = null
  }
}
function applyMention(member: { userId: string; name: string }) {
  const f = mentionFields[mentionTarget.value]
  const ta = f.ta()
  const text = f.get()
  const caret = ta?.selectionStart ?? text.length
  const before = text.slice(0, mentionStart.value)
  const after = text.slice(caret)
  // Insert the display name so the field reads naturally; encodeMentions maps it
  // back to a stable @<id> token at send time.
  const token = `@${member.name} `
  f.set(before + token + after)
  mentionQuery.value = null
  nextTick(() => {
    ta?.focus()
    const pos = (before + token).length
    ta?.setSelectionRange(pos, pos)
  })
}
// Drive the open dropdown from a field's keydown. Returns true when it consumed the
// key, so the field's own Enter/arrow handling is skipped.
function mentionNavKey(e: KeyboardEvent): boolean {
  const list = mentionCandidates.value
  if (mentionQuery.value === null || !list.length) return false
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    mentionIndex.value = (mentionIndex.value + 1) % list.length
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    mentionIndex.value = (mentionIndex.value - 1 + list.length) % list.length
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    applyMention(list[mentionIndex.value]!)
    return true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    mentionQuery.value = null
    return true
  }
  return false
}
function onComposerInput() {
  chat.sendTyping()
  detectMention('composer')
  composerScrolls.value = capScroll(composerTextarea())
}
function onComposerKey(e: KeyboardEvent) {
  if (mentionNavKey(e)) return
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    void submit()
    return
  }
  if (e.key === 'ArrowUp') onComposerUp(e)
}
function onThreadInput(e: Event) {
  detectMention('thread')
  threadScrolls.value = capScroll(e.target as HTMLTextAreaElement)
}
function onThreadKey(e: KeyboardEvent) {
  if (mentionNavKey(e)) return
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    void submitThreadReply()
  }
}
function onEditInput(e: Event) {
  detectMention('edit')
  editScrolls.value = capScroll(e.target as HTMLTextAreaElement)
}
function onEditKey(e: KeyboardEvent) {
  if (mentionNavKey(e)) return
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    void saveEdit()
    return
  }
  if (e.key === 'Escape') {
    cancelEdit()
    return
  }
  if (e.key === 'ArrowUp') onEditUp(e)
  else if (e.key === 'ArrowDown') onEditDown(e)
}

// Images are buffered before send: each is compressed locally and previewed in a
// tray; hitting send posts the caption plus every buffered image as one message.
const acceptImages = ACCEPTED_IMAGE_TYPES.join(',')
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const imageError = ref(false)
const pending = ref<PendingImage[]>([])
const pendingUrls = ref<string[]>([])

// Click a buffered/edit image thumbnail to preview it full-screen (image only),
// the same way sent inline images preview. Esc or a click closes it.
const imagePreview = ref<string | null>(null)
onKeyStroke('Escape', () => {
  if (imagePreview.value) imagePreview.value = null
})

function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
}
async function addFiles(files: File[]) {
  imageError.value = false
  for (const file of files) {
    if (pending.value.length >= MAX_IMAGES) break
    const compressed = await compressToWebp(file)
    if (!compressed) {
      imageError.value = true
      continue
    }
    pending.value = [...pending.value, { bytes: compressed.bytes, byteSize: compressed.byteSize }]
    pendingUrls.value = [...pendingUrls.value, URL.createObjectURL(new Blob([compressed.bytes as BlobPart], { type: imageMimeForBytes(compressed.bytes) }))]
  }
}
function removePending(i: number) {
  const url = pendingUrls.value[i]
  if (url) URL.revokeObjectURL(url)
  pending.value = pending.value.filter((_, j) => j !== i)
  pendingUrls.value = pendingUrls.value.filter((_, j) => j !== i)
}
function clearPending() {
  for (const u of pendingUrls.value) URL.revokeObjectURL(u)
  pending.value = []
  pendingUrls.value = []
}

async function submit() {
  const images = pending.value
  const parentId = replyTo.value?.id ?? null
  if (!draft.value.trim() && images.length === 0) return
  if (overLimit.value) return
  const text = encodeMentions(draft.value, detail.data.value?.members ?? [])
  const mentions = extractMentions(text)
  mentionQuery.value = null
  draft.value = ''
  composerScrolls.value = false
  replyTo.value = null
  const urls = pendingUrls.value
  pending.value = []
  pendingUrls.value = []
  await chat.send(text, { parentId, images, mentions })
  for (const u of urls) URL.revokeObjectURL(u)
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  void addFiles(imageFilesFrom(input.files))
  input.value = ''
}
// Drag state via an enter/leave depth counter so moving over child elements
// doesn't flicker the dropzone overlay off.
let dragDepth = 0
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file')
}
function onDragEnter(e: DragEvent) {
  if (!dragHasFiles(e)) return
  dragDepth++
  dragOver.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragOver.value = false
}
function onDrop(e: DragEvent) {
  dragDepth = 0
  dragOver.value = false
  void addFiles(imageFilesFrom(e.dataTransfer?.files))
}
function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.items ?? [])
    .filter((i) => i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f)
  if (files.length) void addFiles(files)
}

onUnmounted(() => {
  clearPending()
  revokeEditUrls()
})

// A pick shared "to chat" lands in the ACTIVE room's composer tray for review, so
// it honors whichever tab is open (league or a match) rather than always the
// league room. The dock shows one panel at a time, so only its visible room takes
// it; re-checks when the panel becomes active (the dock was opened by the share).
const shareInbox = useChatShareInbox()
function tryTakeShare() {
  if (!shareInbox.pending.value || !props.active) return
  const taken = shareInbox.take()
  if (!taken) return
  pending.value = [...pending.value, taken.image]
  pendingUrls.value = [
    ...pendingUrls.value,
    URL.createObjectURL(new Blob([taken.image.bytes as BlobPart], { type: imageMimeForBytes(taken.image.bytes) })),
  ]
  if (taken.caption && !draft.value.trim()) draft.value = taken.caption
}
watch([shareInbox.pending, () => props.active], tryTakeShare, { immediate: true })

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
// True while older history is being prepended, so the growth watcher neither
// jumps to the bottom nor raises the "new messages" nudge for backfill.
const prepending = ref(false)

// Client-side search (the server only holds ciphertext): filter the loaded,
// decrypted messages by text, matching mention display names too. Older history
// is searchable by loading more first.
const searchOpen = ref(false)
const searchQuery = ref('')
const searchEl = ref<{ $el?: HTMLElement } | null>(null)
const displayMessages = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!searchOpen.value || !q) return messages.value
  return messages.value.filter((m) => m.text && decodeMentions(m.text, names.value, t('chat.unknownUser')).toLowerCase().includes(q))
})
function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    nextTick(() => {
      const el = searchEl.value?.$el
      const inp = (el?.tagName === 'INPUT' ? el : el?.querySelector?.('input')) as HTMLInputElement | undefined
      inp?.focus()
    })
  } else {
    searchQuery.value = ''
  }
}
async function loadOlder() {
  const el = listEl.value
  const before = el?.scrollHeight ?? 0
  prepending.value = true
  try {
    await chat.loadOlder()
  } finally {
    // Keep the viewport anchored: the list grew at the top, so push the scroll
    // down by exactly the added height.
    nextTick(() => {
      const e = listEl.value
      if (e) e.scrollTop += e.scrollHeight - before
      prepending.value = false
    })
  }
}
function onScroll() {
  const el = listEl.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  if (atBottom.value) hasNew.value = false
}
// Only consume forceBottom once we actually scroll a present list. While the
// chat is (re)loading the list is replaced by a spinner (v-if="loading"), so a
// scroll attempt then is a no-op and the flag must survive until the list is back.
function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value
    if (!el) return
    el.scrollTop = el.scrollHeight
    hasNew.value = false
    forceBottom.value = false
  })
}
// Watch the list itself (not just its length): a room reload swaps the whole
// array - possibly to the same length - so a length-only watch can miss it. A
// pending forceBottom (room switch / became visible) jumps as soon as there is
// content; otherwise a genuine new message follows the bottom or raises the nudge.
let prevLen = 0
watch(
  messages,
  (cur) => {
    const grew = cur.length > prevLen
    prevLen = cur.length
    // Backfill (load-older) handles its own scroll anchoring; don't fight it.
    if (prepending.value) return
    if (forceBottom.value) {
      scrollToBottom()
      return
    }
    if (grew) {
      if (atBottom.value) scrollToBottom()
      else hasNew.value = true
    }
  },
)
// The list reappears after a (re)load finishes: this is when a switch/open can
// finally scroll, since the list had no DOM while loading. ready && !loading is
// exactly when the message list is mounted.
watch(
  () => ready.value && !loading.value,
  (shown) => {
    if (shown && forceBottom.value) scrollToBottom()
  },
)
// Switching room (Global <-> Match) or league reloads the list, which unmounts it
// while loading and remounts it scrolled to the top: land at the latest, just like
// opening the chat does. Flag it; the reload's repopulate triggers the jump.
watch(
  () => [props.leagueId, props.matchId],
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
</script>

<template>
  <div
    class="relative flex flex-col gap-3"
    :class="props.flat ? '' : 'ng-card rounded-2xl border p-4'"
    :style="props.flat ? '' : 'background: var(--p-content-background); border-color: var(--p-content-border-color)'"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drag-and-drop image dropzone, covering the whole panel so a drop anywhere
         on the chat is caught, with a clear overlay. pointer-events:none so the
         drag events stay on the panel root (the depth counter tracks enter/leave). -->
    <div
      v-if="ready && dragOver"
      class="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold"
      style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 14%, var(--p-content-background)); color: var(--p-primary-color)"
    >
      <i class="pi pi-image text-2xl" />
      {{ t('chat.image.dropHere') }}
    </div>
    <div class="flex items-center gap-2">
      <i class="pi pi-lock" style="color: var(--p-primary-color)" />
      <span class="font-semibold truncate">{{ isDm ? otherName : props.matchId ? t('chat.threadTitle') : t('chat.roomTitle') }}</span>
      <span v-tooltip.top="t('chat.e2eeHint')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full" style="background: var(--ng-star-soft); color: var(--ng-star)">{{ t('chat.e2ee') }}</span>
      <span v-if="changedCount > 0" v-tooltip.top="t('chat.verify.changedWarn')" class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)"><i class="pi pi-exclamation-triangle text-[10px]" />{{ t('chat.verify.changed') }}</span>
      <div v-if="ready" class="ms-auto flex items-center gap-3">
        <button type="button" v-tooltip.top="t('chat.search.button')" class="opacity-70 hover:opacity-100 inline-flex items-center" :class="searchOpen ? 'opacity-100' : ''" :style="searchOpen ? 'color: var(--p-primary-color)' : ''" :aria-label="t('chat.search.button')" @click="toggleSearch">
          <i class="pi pi-search" />
        </button>
        <button type="button" v-tooltip.top="t('chat.media.button')" class="opacity-70 hover:opacity-100 inline-flex items-center" :aria-label="t('chat.media.button')" :disabled="mediaLoading" @click="openMedia">
          <i class="pi pi-images" />
        </button>
        <!-- Overflow menu: verify safety numbers, key backup and admin actions,
             tucked away so they are deliberate and don't crowd the composer. Key
             verification and identity recovery apply to a DM too (same E2EE
             identity), so the menu shows there; the admin/moderation items stay
             league-only. -->
        <div class="relative">
          <button type="button" class="relative opacity-70 hover:opacity-100 inline-flex items-center" :aria-label="t('chat.menu.button')" @click="menuOpen = !menuOpen">
            <i class="pi pi-ellipsis-h" />
            <span v-if="changedCount > 0" class="absolute -top-1 -right-1 w-2 h-2 rounded-full" style="background: var(--ng-danger)" />
          </button>
          <div
            v-if="menuOpen"
            class="absolute end-0 top-7 z-30 w-56 rounded-lg border shadow-lg py-1 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <button type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" @click="showVerify = !showVerify; menuOpen = false">
              <i class="pi pi-shield text-xs" style="color: var(--p-primary-color)" />
              <span class="flex-1">{{ t('chat.verify.show') }}</span>
              <span v-if="changedCount > 0" class="text-xs font-bold" style="color: var(--ng-danger)">{{ changedCount }}</span>
            </button>
            <button v-if="!hasRecovery" type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" :disabled="recoveryBusy" @click="menuOpen = false; openRecoverySetup()">
              <i class="pi pi-key text-xs" style="color: var(--p-primary-color)" />
              <span class="flex-1">{{ t('chat.setupRecovery') }}</span>
            </button>
            <button v-if="muted.length" type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" @click="showMuted = !showMuted; menuOpen = false">
              <i class="pi pi-volume-off text-xs" />
              <span class="flex-1">{{ t('chat.muted.show', { n: muted.length }) }}</span>
            </button>
            <template v-if="isAdmin">
              <div class="my-1 border-t" style="border-color: var(--p-content-border-color)" />
              <button type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" @click="menuOpen = false; openReports()">
                <i class="pi pi-flag text-xs" /><span class="flex-1">{{ t('chat.moderation.queue') }}</span>
              </button>
              <button type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" @click="showRotate = true; menuOpen = false">
                <i class="pi pi-sync text-xs" /><span class="flex-1">{{ t('chat.rotate.button') }}</span>
              </button>
              <button type="button" class="w-full flex items-center gap-2 px-3 py-1.5 text-start opacity-90 hover:opacity-100" style="color: var(--ng-danger)" @click="menuOpen = false; chat.disableChat()">
                <i class="pi pi-power-off text-xs" /><span class="flex-1">{{ t('chat.disable') }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
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
        <!-- Client-side message search over the loaded (decrypted) messages. -->
        <div v-if="searchOpen" class="flex flex-col gap-1 mb-2">
          <div class="flex items-center gap-2">
            <span class="relative flex-1">
              <i class="pi pi-search absolute start-2 top-1/2 -translate-y-1/2 text-xs" style="color: var(--p-text-muted-color)" />
              <InputText ref="searchEl" v-model="searchQuery" :placeholder="t('chat.search.placeholder')" class="w-full !ps-7" size="small" />
            </span>
            <small v-if="searchQuery.trim()" class="tabular-nums whitespace-nowrap" style="color: var(--p-text-muted-color)">{{ displayMessages.length === 1 ? t('chat.search.one') : t('chat.search.results', { n: displayMessages.length }) }}</small>
            <button type="button" class="opacity-70 hover:opacity-100" :aria-label="t('chat.search.close')" @click="toggleSearch"><i class="pi pi-times text-xs" /></button>
          </div>
          <small v-if="hasMore" class="opacity-70" style="color: var(--p-text-muted-color)">{{ t('chat.search.deeper') }}</small>
        </div>
        <div
          ref="listEl"
          class="relative flex flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain"
          :style="`max-height: ${props.tall ? '60vh' : '22rem'}`"
          @scroll="onScroll"
        >
          <button
            v-if="hasMore"
            type="button"
            class="self-center text-xs underline opacity-70 hover:opacity-100 py-1"
            :disabled="loadingOlder"
            @click="loadOlder"
          >
            {{ loadingOlder ? t('chat.loading') : t('chat.loadMore') }}
          </button>
          <p v-if="!messages.length" class="text-sm py-6 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.empty') }}</p>
          <p v-else-if="searchOpen && searchQuery.trim() && !displayMessages.length" class="text-sm py-6 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.search.none') }}</p>
          <template
            v-for="m in displayMessages"
            :key="m.id"
          >
          <!-- Last-read boundary: everything below arrived since you last read. -->
          <div v-if="!searchOpen && m.id === firstUnreadId" class="flex items-center gap-2 py-0.5 select-none">
            <span class="flex-1 h-px" style="background: color-mix(in srgb, var(--p-primary-color) 45%, transparent)" />
            <span class="text-[10px] uppercase tracking-wider font-semibold" style="color: var(--p-primary-color)">{{ t('chat.newMessagesDivider') }}</span>
            <span class="flex-1 h-px" style="background: color-mix(in srgb, var(--p-primary-color) 45%, transparent)" />
          </div>
          <div
            v-memo="[
              m.id, m.userId, m.text, m.editedAt, m.moderation, m.reported, m.myReaction, m.reactions, m.threadCount, m.attachments, m.parentId,
              names, avatars,
              m.id === firstUnreadId,
              pickerFor === m.id,
              editingId === m.id,
              editingId === m.id ? editDraft : '',
              editingId === m.id ? editAddUrls : 0,
              editingId === m.id ? editOverLimit : false,
              editingId === m.id ? editScrolls : false,
              editingId === m.id ? editExisting.map((e) => (e.removed ? 1 : 0) + (e.url ?? '')).join('|') : '',
              threadParentId === m.id,
              threadParentId === m.id ? threadDraft : '',
              threadParentId === m.id ? threadMessages : 0,
              threadParentId === m.id ? threadLoading : false,
              threadParentId === m.id ? threadScrolls : false,
            ]"
            :data-mid="m.id"
            class="group text-sm flex flex-col rounded transition-colors min-w-0"
          >
            <div class="flex items-center gap-2 mb-0.5" :class="m.userId === meId ? 'flex-row-reverse' : ''">
              <NuxtLink
                v-if="profileLink(m.userId)"
                :to="profileLink(m.userId)!"
                class="flex items-center gap-2 min-w-0 hover:underline"
              >
                <UserAvatar :image="avatarFor(m.userId)" :user-id="m.userId" class="!w-6 !h-6 shrink-0 text-[0.6rem]" />
                <span class="font-semibold truncate" :style="m.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(m.userId) }}</span>
              </NuxtLink>
              <span v-else class="flex items-center gap-2 min-w-0">
                <UserAvatar :image="avatarFor(m.userId)" :user-id="m.userId" class="!w-6 !h-6 shrink-0 text-[0.6rem]" />
                <span class="font-semibold truncate" :style="m.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(m.userId) }}</span>
              </span>
              <span v-tooltip.top="fmtFull(m.createdAt)" class="text-[10px]" style="color: var(--p-text-muted-color)">{{ fmtTime(m.createdAt) }}</span>
              <span v-if="m.editedAt" v-tooltip.bottom="t('chat.edit.at', { time: fmtTime(m.editedAt) })" class="text-[10px] italic" style="color: var(--p-text-muted-color)">{{ t('chat.edit.edited') }}</span>
              <span v-if="!isDm && m.moderation === 'PENDING'" class="text-[10px] uppercase tracking-wider font-semibold px-1 rounded" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.moderation.pendingTag') }}</span>
              <!-- Per-message actions, icon-only, revealed on hover. -->
              <span v-if="m.moderation !== 'REMOVED'" class="ms-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" v-tooltip.bottom="t('chat.reply.button')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.reply.button')" @click="startReply(m)"><i class="pi pi-reply text-xs" /></button>
                <button type="button" v-tooltip.bottom="t('chat.thread.reply')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.thread.reply')" @click="openThreadFor(m)"><i class="pi pi-comments text-xs" /></button>
                <span v-if="contentVisible(m)" class="relative inline-flex">
                  <button type="button" v-tooltip.bottom="t('chat.react.add')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.react.add')" @click="pickerFor = pickerFor === m.id ? null : m.id"><i class="pi pi-face-smile text-xs" /></button>
                  <div
                    v-if="pickerFor === m.id"
                    class="absolute top-6 end-0 z-20 flex items-center gap-1 p-1 rounded-full border shadow-lg"
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
                </span>
                <button v-if="m.text" type="button" v-tooltip.bottom="t('chat.copyText')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.copyText')" @click="copyText(m)"><i class="pi pi-copy text-xs" /></button>
                <button v-if="m.userId === meId && m.moderation === 'VISIBLE'" type="button" v-tooltip.bottom="t('chat.edit.button')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.edit.button')" @click="startEdit(m)"><i class="pi pi-pencil text-xs" /></button>
                <button v-if="m.userId && m.userId !== meId" type="button" v-tooltip.bottom="t('chat.mute')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.mute')" @click="chat.toggleMute(m.userId)"><i class="pi pi-volume-off text-xs" /></button>
                <button
                  v-if="!isDm && m.userId && m.userId !== meId"
                  type="button"
                  v-tooltip.bottom="m.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')"
                  class="opacity-60 hover:opacity-100"
                  :aria-label="m.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')"
                  :style="m.reported ? 'color: var(--ng-danger)' : ''"
                  @click="chat.report(m.id)"
                ><i :class="m.reported ? 'pi pi-flag-fill' : 'pi pi-flag'" class="text-xs" /></button>
                <button v-if="!isDm && (isAdmin || m.userId === meId)" type="button" v-tooltip.bottom="m.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" class="opacity-60 hover:opacity-100" :aria-label="m.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" style="color: var(--ng-danger)" @click="chat.moderate(m.id, 'remove')"><i class="pi pi-trash text-xs" /></button>
                <button v-if="!isDm && isAdmin && m.moderation === 'PENDING'" type="button" v-tooltip.bottom="t('chat.moderation.restore')" class="opacity-60 hover:opacity-100" :aria-label="t('chat.moderation.restore')" style="color: var(--p-primary-color)" @click="chat.moderate(m.id, 'restore')"><i class="pi pi-undo text-xs" /></button>
              </span>
            </div>
            <!-- Quoted parent (a reply stays in the main list): click to jump to it. -->
            <button
              v-if="parentOf(m)"
              type="button"
              class="text-start text-xs rounded px-2 py-1 mb-0.5 border-s-2 opacity-80 hover:opacity-100 max-w-full overflow-hidden"
              :class="m.userId === meId ? 'self-end' : 'self-start'"
              style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-text-color) 5%, transparent)"
              @click="jumpTo(m.parentId!)"
            >
              <i class="pi pi-reply text-[10px] me-1" style="color: var(--p-primary-color)" />
              <span class="font-semibold">{{ nameFor(parentOf(m)!.userId) }}</span>
              <span class="ms-1">{{ quoteText(parentOf(m)!) }}</span>
            </button>
            <span v-if="!contentVisible(m)" class="italic" :class="m.userId === meId ? 'self-end' : 'self-start'" style="color: var(--p-text-muted-color)">{{ m.moderation === 'REMOVED' ? t('chat.moderation.removed') : t('chat.moderation.pendingHidden') }}</span>
            <!-- Inline edit of your own message: text plus image add/remove. -->
            <div v-else-if="editingId === m.id" class="relative flex flex-col gap-1">
              <ChatMentionMenu
                v-if="mentionTarget === 'edit' && mentionQuery !== null && mentionCandidates.length"
                :candidates="mentionCandidates"
                :active-index="mentionIndex"
                @select="applyMention"
                @hover="(i) => (mentionIndex = i)"
              />
              <Textarea v-model="editDraft" rows="1" autoResize class="w-full" :style="{ maxHeight: '7.5rem', overflowY: editScrolls ? 'auto' : 'hidden' }" @input="onEditInput" @keydown="onEditKey" />
              <div v-if="editExisting.length || editAdd.length" class="flex flex-wrap gap-1.5">
                <!-- Existing images: tap the x to mark for removal (re-tap to keep). -->
                <div v-for="e in editExisting" :key="`ex-${e.idx}`" class="relative">
                  <div v-if="!e.url" class="w-16 h-16 rounded-lg animate-pulse" style="background: color-mix(in srgb, var(--p-text-color) 10%, transparent)" />
                  <img v-else :src="e.url" :alt="t('chat.image.alt')" class="w-16 h-16 rounded-lg object-cover cursor-zoom-in" :style="e.removed ? 'opacity: 0.35; filter: grayscale(1)' : ''" @click="imagePreview = e.url">
                  <button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow" :style="`background: ${e.removed ? 'var(--p-primary-color)' : 'var(--ng-danger)'}; color: #fff`" :aria-label="e.removed ? t('chat.image.keep') : t('chat.image.remove')" @click="toggleRemoveExisting(e.idx)">
                    <i :class="e.removed ? 'pi pi-undo' : 'pi pi-times'" class="text-[10px]" />
                  </button>
                </div>
                <!-- Newly added images for this edit. -->
                <div v-for="(url, i) in editAddUrls" :key="`add-${i}`" class="relative">
                  <img :src="url" :alt="t('chat.image.alt')" class="w-16 h-16 rounded-lg object-cover cursor-zoom-in" @click="imagePreview = url">
                  <button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow" style="background: var(--ng-danger); color: #fff" :aria-label="t('chat.image.remove')" @click="removeEditAdd(i)">
                    <i class="pi pi-times text-[10px]" />
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <button type="button" class="underline disabled:opacity-40 disabled:no-underline" style="color: var(--p-primary-color)" :disabled="editOverLimit" @click="saveEdit">{{ t('chat.edit.save') }}</button>
                <button type="button" class="underline opacity-70 hover:opacity-100" :disabled="editKept >= MAX_IMAGES" @click="editFileInput?.click()">{{ t('chat.image.add') }}</button>
                <button type="button" class="underline opacity-70 hover:opacity-100" @click="cancelEdit">{{ t('chat.edit.cancel') }}</button>
                <span v-if="editDraft.length > MAX_MESSAGE_TEXT_LENGTH - 200" class="ms-auto tabular-nums" :style="editOverLimit ? 'color: var(--ng-danger)' : 'color: var(--p-text-muted-color)'">{{ t('chat.limit.counter', { n: editDraft.length, max: MAX_MESSAGE_TEXT_LENGTH }) }}</span>
              </div>
            </div>
            <template v-else>
              <ChatMessageContent
                v-if="m.text"
                class="mt-0.5"
                :text="m.text"
                :names="names"
                :profile-link="profileLink"
                :own="m.userId === meId"
                :bubble-style="bubbleStyle(m)"
              />
              <span v-else-if="m.text === null && m.attachments.length === 0" class="italic" :class="m.userId === meId ? 'self-end' : 'self-start'" style="color: var(--p-text-muted-color)">{{ t('chat.cantDecrypt') }}</span>
              <ChatImage
                v-if="m.attachments.length"
                :class="m.userId === meId ? 'self-end' : 'self-start'"
                :message-id="m.id"
                :attachments="m.attachments"
                :load="chat.loadAttachment"
                @open="(idx) => openMessageImages(m, idx)"
              />
            </template>

            <!-- Reaction counts (the add-reaction picker lives in the action row). -->
            <div v-if="contentVisible(m) && emojisWithCount(m.reactions).length" class="flex flex-wrap items-center gap-1 mt-0.5" :class="m.userId === meId ? 'self-end' : ''">
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
            </div>

            <!-- Thread: a reply count opens the thread; thread replies live there,
                 not in the main list. -->
            <button
              v-if="m.threadCount > 0 && threadParentId !== m.id"
              type="button"
              class="inline-flex items-center gap-1 text-xs underline opacity-70 hover:opacity-100 mt-0.5"
              :class="m.userId === meId ? 'self-end' : 'self-start'"
              @click="openThreadFor(m)"
            >
              <i class="pi pi-comments text-[10px]" />{{ m.threadCount === 1 ? t('chat.thread.one') : t('chat.thread.count', { n: m.threadCount }) }}
            </button>

            <!-- Open thread: its replies plus an inline reply composer. -->
            <div
              v-if="threadParentId === m.id"
              :data-thread="m.id"
              class="self-stretch mt-1 ms-3 ps-3 border-s-2 flex flex-col gap-2"
              style="border-color: var(--p-primary-color)"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold" style="color: var(--p-text-muted-color)">{{ t('chat.thread.reply') }}</span>
                <button type="button" class="text-xs underline opacity-70 hover:opacity-100" @click="chat.closeThread()">{{ t('chat.thread.collapse') }}</button>
              </div>
              <p v-if="threadLoading" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.loading') }}</p>
              <p v-else-if="!threadMessages.length" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.thread.empty') }}</p>
              <div v-for="r in threadMessages" :key="r.id" :data-mid="r.id" class="group flex flex-col text-sm min-w-0" :class="r.userId === meId ? 'items-end' : 'items-start'">
                <div class="flex items-center gap-2 self-stretch" :class="r.userId === meId ? 'flex-row-reverse' : ''">
                  <UserAvatar :image="avatarFor(r.userId)" :user-id="r.userId" class="!w-5 !h-5 shrink-0 text-[0.5rem]" />
                  <NuxtLink v-if="profileLink(r.userId)" :to="profileLink(r.userId)!" class="font-semibold truncate text-xs hover:underline" :style="r.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(r.userId) }}</NuxtLink>
                  <span v-else class="font-semibold truncate text-xs" :style="r.userId === meId ? 'color: var(--p-primary-color)' : ''">{{ nameFor(r.userId) }}</span>
                  <span v-tooltip.top="fmtFull(r.createdAt)" class="text-[10px]" style="color: var(--p-text-muted-color)">{{ fmtTime(r.createdAt) }}</span>
                  <span v-if="r.editedAt" class="text-[10px] italic" style="color: var(--p-text-muted-color)">{{ t('chat.edit.edited') }}</span>
                  <span class="ms-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button v-if="!isDm && contentVisible(r) && r.userId && r.userId !== meId" type="button" v-tooltip.bottom="r.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')" class="opacity-60 hover:opacity-100" :aria-label="r.reported ? t('chat.moderation.unreport') : t('chat.moderation.report')" :style="r.reported ? 'color: var(--ng-danger)' : ''" @click="chat.report(r.id)"><i :class="r.reported ? 'pi pi-flag-fill' : 'pi pi-flag'" class="text-[10px]" /></button>
                    <button v-if="!isDm && (isAdmin || r.userId === meId)" type="button" v-tooltip.bottom="r.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" class="opacity-60 hover:opacity-100" :aria-label="r.userId === meId ? t('chat.delete') : t('chat.moderation.remove')" style="color: var(--ng-danger)" @click="chat.moderate(r.id, 'remove')"><i class="pi pi-trash text-[10px]" /></button>
                  </span>
                </div>
                <span v-if="!contentVisible(r)" class="italic text-xs" style="color: var(--p-text-muted-color)">{{ r.moderation === 'REMOVED' ? t('chat.moderation.removed') : t('chat.moderation.pendingHidden') }}</span>
                <template v-else>
                  <ChatMessageContent v-if="r.text" :text="r.text" :names="names" :profile-link="profileLink" :own="r.userId === meId" :bubble-style="bubbleStyle(r)" />
                  <span v-else-if="r.text === null && r.attachments.length === 0" class="italic text-xs" style="color: var(--p-text-muted-color)">{{ t('chat.cantDecrypt') }}</span>
                  <ChatImage v-if="r.attachments.length" :class="r.userId === meId ? 'self-end' : 'self-start'" :message-id="r.id" :attachments="r.attachments" :load="chat.loadAttachment" @open="(idx) => openMessageImages(r, idx)" />
                </template>
              </div>
              <form class="relative flex items-end gap-2" @submit.prevent="submitThreadReply">
                <ChatMentionMenu
                  v-if="mentionTarget === 'thread' && mentionQuery !== null && mentionCandidates.length"
                  :candidates="mentionCandidates"
                  :active-index="mentionIndex"
                  @select="applyMention"
                  @hover="(i) => (mentionIndex = i)"
                />
                <Textarea v-model="threadDraft" :placeholder="t('chat.thread.placeholder')" rows="1" autoResize class="flex-1" :style="{ maxHeight: '7.5rem', overflowY: threadScrolls ? 'auto' : 'hidden' }" @input="onThreadInput" @keydown="onThreadKey" />
                <Button type="submit" icon="pi pi-send" :loading="sending" :disabled="!threadDraft.trim() || threadOverLimit" :aria-label="t('chat.send')" />
              </form>
            </div>
          </div>
          </template>
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
          <!-- Quote target preview, with a cancel. -->
          <div
            v-if="replyTo"
            class="flex items-center gap-2 text-xs rounded px-2 py-1 border-s-2"
            style="border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-text-color) 5%, transparent)"
          >
            <span class="opacity-70">{{ t('chat.reply.replyingTo', { name: nameFor(replyTo.userId) }) }}</span>
            <span class="truncate flex-1" style="color: var(--p-text-muted-color)">{{ previewText(replyTo.text) }}</span>
            <button type="button" class="opacity-70 hover:opacity-100" :aria-label="t('chat.reply.cancel')" @click="replyTo = null"><i class="pi pi-times text-xs" /></button>
          </div>
          <small v-if="typingText" class="italic h-4" style="color: var(--p-text-muted-color)">{{ typingText }}</small>
          <small v-if="imageError" style="color: var(--ng-danger)">{{ t('chat.image.rejected') }}</small>
          <!-- Length cap: warn as it nears the limit, block the send past it. -->
          <div v-if="draft.length > MAX_MESSAGE_TEXT_LENGTH - 200" class="flex items-center gap-2">
            <small v-if="overLimit" class="flex-1" style="color: var(--ng-danger)">{{ t('chat.limit.tooLong', { max: MAX_MESSAGE_TEXT_LENGTH }) }}</small>
            <small class="ms-auto tabular-nums" :style="overLimit ? 'color: var(--ng-danger)' : 'color: var(--p-text-muted-color)'">{{ t('chat.limit.counter', { n: draft.length, max: MAX_MESSAGE_TEXT_LENGTH }) }}</small>
          </div>
          <!-- Buffered images, shown before send; tap the x to drop one. -->
          <div v-if="pendingUrls.length" class="flex flex-wrap gap-1.5">
            <div v-for="(url, i) in pendingUrls" :key="i" class="relative">
              <img :src="url" :alt="t('chat.image.alt')" class="w-16 h-16 rounded-lg object-cover cursor-zoom-in" @click="imagePreview = url">
              <button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow" style="background: var(--ng-danger); color: #fff" :aria-label="t('chat.image.remove')" @click="removePending(i)">
                <i class="pi pi-times text-[10px]" />
              </button>
            </div>
          </div>
          <!-- Shared (outside the message loop) so the edit "add image" button's
               ref isn't collected into a per-row array. -->
          <input ref="editFileInput" type="file" :accept="acceptImages" multiple class="hidden" @change="onEditFilePicked">
          <form class="relative flex items-end gap-2" @submit.prevent="submit">
            <!-- @mention autocomplete, anchored above the composer. -->
            <ChatMentionMenu
              v-if="!isDm && mentionTarget === 'composer' && mentionQuery !== null && mentionCandidates.length"
              :candidates="mentionCandidates"
              :active-index="mentionIndex"
              @select="applyMention"
              @hover="(i) => (mentionIndex = i)"
            />
            <input ref="fileInput" type="file" :accept="acceptImages" multiple class="hidden" @change="onFilePicked">
            <Button type="button" icon="pi pi-image" severity="secondary" text :disabled="sending || pending.length >= MAX_IMAGES" :aria-label="t('chat.image.attach')" @click="fileInput?.click()" />
            <div class="relative">
              <Button type="button" data-emoji-toggle icon="pi pi-face-smile" severity="secondary" text :aria-label="t('chat.emoji.button')" @click="emojiOpen = !emojiOpen" />
              <div v-if="emojiOpen" class="absolute bottom-full start-0 mb-2 z-30">
                <EmojiPicker @select="insertEmoji" @close="emojiOpen = false" />
              </div>
            </div>
            <Textarea ref="composer" v-model="draft" :placeholder="t('chat.placeholder')" rows="1" autoResize class="flex-1" :style="{ maxHeight: '7.5rem', overflowY: composerScrolls ? 'auto' : 'hidden' }" @keydown="onComposerKey" @input="onComposerInput" @paste="onPaste" />
            <Button type="submit" icon="pi pi-send" :loading="sending" :disabled="(!draft.trim() && !pending.length) || overLimit" v-tooltip.top="overLimit ? t('chat.limit.tooLong', { max: MAX_MESSAGE_TEXT_LENGTH }) : ''" :aria-label="t('chat.send')" />
          </form>
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

    <!-- Safety-number verification and identity recovery apply to a DM too (the same
         E2EE identity), so they render unconditionally. The enable/rotate/reports
         dialogs are league-only - a DM is always on, has no admin and no per-message
         moderation - so each carries its own v-if="!isDm". -->
    <!-- Legal-cover warning before enabling. -->
    <Dialog v-if="!isDm" v-model:visible="showWarning" modal :header="t('chat.warning.title')" :style="{ width: '32rem', maxWidth: '92vw' }">
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

    <!-- Safety-number verification (modal so it never fights the chat for width):
         compare these out-of-band to detect a swapped key. -->
    <Dialog v-model:visible="showVerify" modal :header="t('chat.verify.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <div class="flex flex-col gap-2 text-sm">
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
      <template #footer>
        <Button :label="t('chat.verify.done')" severity="secondary" text @click="showVerify = false" />
      </template>
    </Dialog>

    <!-- Rotate-key confirm (admins). -->
    <Dialog v-if="!isDm" v-model:visible="showRotate" modal :header="t('chat.rotate.title')" :style="{ width: '30rem', maxWidth: '92vw' }">
      <p class="text-sm">{{ t('chat.rotate.body') }}</p>
      <template #footer>
        <Button :label="t('chat.rotate.cancel')" severity="secondary" text @click="showRotate = false" />
        <Button :label="t('chat.rotate.confirm')" :loading="rotating" @click="confirmRotate" />
      </template>
    </Dialog>

    <!-- Reports queue (owner/moderator): read each, then keep or remove. -->
    <Dialog v-if="!isDm" v-model:visible="showReports" modal :header="t('chat.moderation.queueTitle')" :style="{ width: '34rem', maxWidth: '92vw' }">
      <div v-if="reportsLoading" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('chat.loading') }}</div>
      <p v-else-if="!reports.length" class="text-sm py-4 text-center" style="color: var(--p-text-muted-color)">{{ t('chat.moderation.empty') }}</p>
      <div v-else class="flex flex-col gap-3">
        <div v-for="r in reports" :key="r.id" class="flex flex-col gap-1 border-b pb-2 text-sm" style="border-color: var(--p-content-border-color)">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold">{{ nameFor(r.userId) }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="border: 1px solid var(--ng-danger); color: var(--ng-danger)">{{ t('chat.moderation.reportCount', { n: r.reports }) }}</span>
            <span v-if="r.moderation === 'PENDING'" class="text-[10px] uppercase tracking-wider" style="color: var(--ng-danger)">{{ t('chat.moderation.pendingTag') }}</span>
          </div>
          <span class="break-words">{{ previewText(r.text) }}</span>
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

    <!-- Shared image viewer: cycles a message's images, or the room media gallery. -->
    <ChatLightbox
      v-model:visible="lbVisible"
      v-model:index="lbIndex"
      :items="lbItems"
      :messages="messages"
      :load="chat.loadAttachment"
      :react="chat.react"
      :league="leagueName"
      :match="props.matchLabel"
    />

    <!-- Clean full-screen preview of a buffered/edit image (no actions, no text). -->
    <Teleport to="body">
      <div
        v-if="imagePreview"
        class="fixed inset-0 z-[2000] flex items-center justify-center p-4 cursor-zoom-out"
        style="background: rgba(0, 0, 0, 0.85)"
        role="dialog"
        @click="imagePreview = null"
      >
        <img :src="imagePreview" :alt="t('chat.image.alt')" class="max-h-full max-w-full object-contain rounded-lg">
      </div>
    </Teleport>
  </div>
</template>
