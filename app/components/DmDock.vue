<script setup lang="ts">
// Floating direct-messages dock, bottom-left (the league ChatDock owns bottom-
// right). Available app-wide to any signed-in user - DMs are global, not league
// scoped. End-to-end encrypted: the composable holds the keys and decrypts; this
// component only ever sees the decrypted text it renders. Three views: the inbox
// (conversation list), an open thread, and the new-message recipient search.
import type { DmRecipientDTO } from '#shared/types/dm'

const { t } = useI18n()
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data?.user)

const dm = useDms()
const collapsed = ref(true)
const view = ref<'inbox' | 'thread' | 'new'>('inbox')
const openThreadId = ref<string | null>(null)
const draft = ref('')
const editing = ref<{ id: string; text: string } | null>(null)

const search = ref('')
const results = ref<DmRecipientDTO[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

const openThread = computed(() => (dm.threads.data.value ?? []).find((th) => th.threadId === openThreadId.value) ?? null)
const openMessages = computed(() => (openThreadId.value ? dm.threadMessages(openThreadId.value) : []))
const openOther = computed(() => (openThreadId.value ? dm.otherOf(openThreadId.value) : null))

async function openDock() {
  collapsed.value = false
  await dm.ensureIdentity()
}

async function selectThread(threadId: string) {
  openThreadId.value = threadId
  view.value = 'thread'
  editing.value = null
  draft.value = ''
  await dm.loadThread(threadId)
  dm.markRead.mutate(threadId)
  await nextTick()
  scrollToBottom()
}

function backToInbox() {
  view.value = 'inbox'
  openThreadId.value = null
}

const listEl = ref<HTMLElement | null>(null)
function scrollToBottom() {
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}
// Follow the conversation as messages arrive (own send or a live push).
watch(openMessages, async () => {
  if (view.value !== 'thread') return
  await nextTick()
  scrollToBottom()
})

async function submit() {
  const text = draft.value.trim()
  if (!text || !openThreadId.value) return
  if (editing.value) {
    const id = editing.value.id
    editing.value = null
    draft.value = ''
    await dm.edit.mutateAsync({ threadId: openThreadId.value, messageId: id, text })
    return
  }
  draft.value = ''
  await dm.send.mutateAsync({ threadId: openThreadId.value, text })
}

function startEdit(id: string, text: string | null) {
  editing.value = { id, text: text ?? '' }
  draft.value = text ?? ''
}
function cancelEdit() {
  editing.value = null
  draft.value = ''
}

function openNew() {
  view.value = 'new'
  search.value = ''
  results.value = []
}
watch(search, (q) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    results.value = await dm.searchRecipients(q.trim())
  }, 250)
})

async function pickRecipient(r: DmRecipientDTO) {
  const threadId = await dm.startThread.mutateAsync(r.userId)
  await selectThread(threadId)
}

// Deep link from a DM notification (bell/push): /?dm=<threadId> opens the dock
// straight to that conversation.
const route = useRoute()
onMounted(() => {
  const wanted = route.query.dm
  if (typeof wanted === 'string' && wanted && signedIn.value) {
    void (async () => {
      await openDock()
      await selectThread(wanted)
    })()
  }
})

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
</script>

<template>
  <div v-if="signedIn" class="fixed bottom-4 left-4 z-40 flex flex-col items-start" style="max-width: 92vw">
    <!-- Collapsed: the DM bubble, badged with total unread across conversations. -->
    <button
      v-show="collapsed"
      type="button"
      class="relative rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      style="background: var(--p-content-background); color: var(--p-primary-color); border: 1px solid var(--p-content-border-color)"
      :aria-label="t('dm.open')"
      @click="openDock"
    >
      <i class="pi pi-send text-xl" />
      <span
        v-if="dm.totalUnread.value"
        class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center tabular-nums"
        style="background: var(--ng-danger); color: #fff"
      >{{ dm.totalUnread.value > 99 ? '99+' : dm.totalUnread.value }}</span>
    </button>

    <div
      v-show="!collapsed"
      class="ng-card rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
      style="width: 22rem; max-width: 94vw; height: 32rem; background: var(--p-content-background); border-color: var(--p-content-border-color)"
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b shrink-0" style="border-color: var(--p-content-border-color)">
        <button v-if="view !== 'inbox'" type="button" class="opacity-70 hover:opacity-100" :aria-label="t('dm.back')" @click="backToInbox">
          <i class="pi pi-arrow-left" />
        </button>
        <span class="font-semibold truncate flex-1">
          <template v-if="view === 'thread'">{{ openOther?.name ?? openThread?.other.name ?? '' }}</template>
          <template v-else-if="view === 'new'">{{ t('dm.new') }}</template>
          <template v-else>{{ t('dm.title') }}</template>
        </span>
        <button v-if="view === 'inbox'" type="button" class="opacity-70 hover:opacity-100" :aria-label="t('dm.new')" @click="openNew">
          <i class="pi pi-pencil" />
        </button>
        <button type="button" class="opacity-70 hover:opacity-100" :aria-label="t('dm.close')" @click="collapsed = true">
          <i class="pi pi-chevron-down" />
        </button>
      </div>

      <!-- Identity not ready (e.g. a new device without the key): tell the user. -->
      <div v-if="dm.identityStatus.value === 'needs-restore'" class="p-4 text-sm" style="color: var(--p-text-muted-color)">
        {{ t('dm.needsRestore') }}
      </div>

      <!-- Inbox -->
      <div v-else-if="view === 'inbox'" class="flex-1 overflow-y-auto">
        <p v-if="!(dm.threads.data.value ?? []).length" class="p-4 text-sm" style="color: var(--p-text-muted-color)">{{ t('dm.empty') }}</p>
        <button
          v-for="th in dm.threads.data.value ?? []"
          :key="th.threadId"
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-black/5 dark:hover:bg-white/10"
          @click="selectThread(th.threadId)"
        >
          <img v-if="th.other.image" :src="th.other.image" class="w-9 h-9 rounded-full object-cover shrink-0" alt="" >
          <span v-else class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ initial(th.other.name) }}</span>
          <span class="flex-1 min-w-0">
            <span class="block truncate font-medium">{{ th.other.name }}</span>
            <span v-if="th.lastMessageAt" class="block truncate text-xs" style="color: var(--p-text-muted-color)">{{ timeLabel(th.lastMessageAt) }}</span>
          </span>
          <span v-if="th.unread" class="min-w-5 h-5 px-1 shrink-0 rounded-full text-xs font-bold flex items-center justify-center tabular-nums" style="background: var(--ng-danger); color: #fff">{{ th.unread > 99 ? '99+' : th.unread }}</span>
        </button>
      </div>

      <!-- New message: recipient search -->
      <div v-else-if="view === 'new'" class="flex-1 flex flex-col min-h-0">
        <div class="p-3 shrink-0">
          <input
            v-model="search"
            type="text"
            class="w-full rounded-lg border px-3 py-2 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
            :placeholder="t('dm.searchPlaceholder')"
          >
        </div>
        <div class="flex-1 overflow-y-auto">
          <p v-if="!results.length" class="px-3 py-2 text-sm" style="color: var(--p-text-muted-color)">{{ t('dm.searchHint') }}</p>
          <button
            v-for="r in results"
            :key="r.userId"
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2 text-start hover:bg-black/5 dark:hover:bg-white/10"
            @click="pickRecipient(r)"
          >
            <img v-if="r.image" :src="r.image" class="w-8 h-8 rounded-full object-cover shrink-0" alt="" >
            <span v-else class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ initial(r.name) }}</span>
            <span class="flex-1 truncate">{{ r.name }}</span>
            <span v-if="r.shared" class="text-xs px-1.5 py-0.5 rounded" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)">{{ t('dm.coMember') }}</span>
          </button>
        </div>
      </div>

      <!-- Open thread -->
      <template v-else>
        <div ref="listEl" class="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
          <div v-for="m in openMessages" :key="m.id" class="flex flex-col" :class="m.mine ? 'items-end' : 'items-start'">
            <div
              class="max-w-[80%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words"
              :style="m.mine ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color)' : 'background: var(--p-content-hover-background, rgba(127,127,127,0.15))'"
            >
              <span v-if="m.text !== null">{{ m.text }}</span>
              <span v-else class="italic opacity-70">{{ t('dm.undecryptable') }}</span>
            </div>
            <div class="flex items-center gap-2 px-1 text-[10px]" style="color: var(--p-text-muted-color)">
              <span>{{ timeLabel(m.createdAt) }}</span>
              <span v-if="m.editedAt">{{ t('dm.edited') }}</span>
              <button v-if="m.mine && m.text !== null" type="button" class="hover:underline" @click="startEdit(m.id, m.text)">{{ t('dm.edit') }}</button>
            </div>
          </div>
        </div>
        <form class="p-2 border-t shrink-0 flex items-center gap-2" style="border-color: var(--p-content-border-color)" @submit.prevent="submit">
          <button v-if="editing" type="button" class="opacity-70 hover:opacity-100 text-xs" @click="cancelEdit">{{ t('dm.cancel') }}</button>
          <input
            v-model="draft"
            type="text"
            class="flex-1 rounded-lg border px-3 py-2 text-sm"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
            :placeholder="editing ? t('dm.editPlaceholder') : t('dm.placeholder')"
          >
          <button type="submit" class="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40" style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)" :disabled="!draft.trim()">
            <i class="pi pi-send" />
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
