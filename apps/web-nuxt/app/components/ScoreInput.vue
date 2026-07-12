<script setup lang="ts">
import { isOutlandishScore } from '~/utils/prediction-sanity'

const props = defineProps<{ home: number | null; away: number | null; disabled?: boolean }>()
const emit = defineEmits<{ update: [value: { home: number; away: number }] }>()
const { t } = useI18n()

const home = ref<number | null>(props.home)
const away = ref<number | null>(props.away)
const saved = ref(false)
const editing = ref(false)

watch(
  () => [props.home, props.away],
  () => {
    // A background refetch (live scores, invalidation) must not clobber a draft mid-edit.
    if (editing.value) return
    home.value = props.home
    away.value = props.away
  },
)

const dirty = computed(() => home.value != null && away.value != null && (home.value !== props.home || away.value !== props.away))

// Auto-save: debounced while typing, immediate on blur/enter - no Save button.
let debounce: ReturnType<typeof setTimeout> | undefined
function scheduleCommit() {
  clearTimeout(debounce)
  debounce = setTimeout(commit, 900)
}

// An implausible scoreline (8+ goals for one side, or a 12+ goal aggregate)
// holds a confirm before saving, so a fat-finger like 1-33 isn't committed
// silently. It's a confirm, not a block: accept saves, cancel restores the last
// value. Plausible scores still auto-save untouched.
const confirmOutlandish = ref(false)
const pending = ref<{ home: number; away: number } | null>(null)

function commit() {
  clearTimeout(debounce)
  if (!dirty.value) return
  const h = home.value as number
  const a = away.value as number
  if (isOutlandishScore(h, a)) {
    pending.value = { home: h, away: a }
    confirmOutlandish.value = true
    return
  }
  doCommit(h, a)
}
function doCommit(h: number, a: number) {
  emit('update', { home: h, away: a })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}
function acceptOutlandish() {
  if (pending.value) doCommit(pending.value.home, pending.value.away)
  pending.value = null
}
// Closing the confirm without accepting (Cancel, mask, Esc) discards the
// implausible draft and restores the last saved value.
watch(confirmOutlandish, (open) => {
  if (open || !pending.value) return
  pending.value = null
  home.value = props.home
  away.value = props.away
})
onBeforeUnmount(() => clearTimeout(debounce))

// Enter/space hops home -> away -> next match's home, so a whole matchday can
// be typed without touching the mouse. Inputs of every ScoreInput on the page
// share the ng-score-input class; "next" is plain DOM order.
function onAdvanceKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  commit()
  // Don't hop to the next match while the outlandish confirm is up: the user is
  // mid-decision on this one.
  if (confirmOutlandish.value) return
  const current = e.target as HTMLInputElement
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input.ng-score-input'))
    .filter((el) => !el.disabled && el.offsetParent !== null)
  const next = all[all.indexOf(current) + 1]
  if (next) {
    next.focus()
    next.select()
  } else {
    current.blur()
  }
}
</script>

<template>
  <!-- single row; the ✓ flash is absolutely positioned so it never affects layout
       (a reserved line below used to push the inputs above the row's center) -->
  <div class="relative flex items-center justify-center gap-2" @keydown="onAdvanceKey">
    <InputNumber v-model="home" :min="0" :max="99" :disabled="disabled" placeholder="–" input-class="ng-score-input" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="home = (typeof $event.value === 'number' ? $event.value : null); scheduleCommit()" @focus="editing = true" @blur="editing = false; commit()" />
    <span class="font-bold opacity-60">:</span>
    <InputNumber v-model="away" :min="0" :max="99" :disabled="disabled" placeholder="–" input-class="ng-score-input" :input-style="{ width: '2.6rem', textAlign: 'center' }" @input="away = (typeof $event.value === 'number' ? $event.value : null); scheduleCommit()" @focus="editing = true" @blur="editing = false; commit()" />
    <span class="absolute start-full ms-1.5 top-1/2 -translate-y-1/2 leading-none" style="color: var(--p-primary-color)">
      <i v-if="saved" class="pi pi-check" style="font-size: 0.72rem" />
    </span>
    <AppConfirmDialog
      v-model:visible="confirmOutlandish"
      :header="t('predictions.outlandish.title')"
      :message="t('predictions.outlandish.body', { home: pending?.home ?? 0, away: pending?.away ?? 0 })"
      :confirm-label="t('predictions.outlandish.confirm')"
      @confirm="acceptOutlandish"
    />
  </div>
</template>
