<script setup lang="ts">
const props = defineProps<{ matchId: string; kickoffTime: string }>()
const { t } = useI18n()
const { share, copy, download, busy } = useShareCard()
const menu = ref()

// Post-kickoff the score is public, so the result is shareable; before kickoff
// the user chooses to keep the pick sealed or to reveal their own score.
const locked = computed(() => isLocked(props.kickoffTime))

// The native share sheet (mobile) already offers copy/save, so "Share" and
// "Copy link" would duplicate on desktop. Show the native Share only where it
// exists, and fall back to an explicit Copy link otherwise.
const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
})

function pick(fn: () => void) {
  menu.value?.hide()
  fn()
}

const itemClass =
  'px-3 py-2 text-sm text-left flex items-center gap-2 transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50'
</script>

<template>
  <Button
    type="button"
    :aria-label="t('share.action')"
    icon="pi pi-share-alt"
    text
    rounded
    size="small"
    severity="secondary"
    :loading="busy"
    @click="(e) => menu.toggle(e)"
  />
  <Popover ref="menu">
    <div class="flex flex-col w-56 -m-1">
      <template v-if="locked">
        <button v-if="canShare" type="button" :class="itemClass" :disabled="busy" @click="pick(() => share(props.matchId, 'result'))">
          <i class="pi pi-share-alt" style="color: var(--p-primary-color)" /> {{ t('share.shareResult') }}
        </button>
        <button v-else type="button" :class="itemClass" :disabled="busy" @click="pick(() => copy(props.matchId, 'result'))">
          <i class="pi pi-link" style="color: var(--p-primary-color)" /> {{ t('share.copyLink') }}
        </button>
        <button type="button" :class="itemClass" :disabled="busy" @click="pick(() => download(props.matchId, 'result'))">
          <i class="pi pi-download opacity-60" /> {{ t('share.download') }}
        </button>
      </template>
      <template v-else>
        <button type="button" :class="itemClass" :disabled="busy" @click="pick(() => share(props.matchId, 'sealed'))">
          <i class="pi pi-lock" style="color: var(--p-primary-color)" /> {{ t('share.shareSealed') }}
        </button>
        <button type="button" :class="itemClass" :disabled="busy" @click="pick(() => share(props.matchId, 'reveal'))">
          <i class="pi pi-eye opacity-60" /> {{ t('share.revealScore') }}
        </button>
      </template>
    </div>
  </Popover>
</template>
