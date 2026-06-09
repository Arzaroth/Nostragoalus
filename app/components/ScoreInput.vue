<script setup lang="ts">
const props = defineProps<{ home: number | null; away: number | null; disabled?: boolean }>()
const emit = defineEmits<{ update: [value: { home: number; away: number }] }>()

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
function commit() {
  clearTimeout(debounce)
  if (!dirty.value) return
  emit('update', { home: home.value as number, away: away.value as number })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}
onBeforeUnmount(() => clearTimeout(debounce))

// Enter/space hops home -> away -> next match's home, so a whole matchday can
// be typed without touching the mouse. Inputs of every ScoreInput on the page
// share the ng-score-input class; "next" is plain DOM order.
function onAdvanceKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  commit()
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
    <span class="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 leading-none" style="color: var(--p-primary-color)">
      <i v-if="saved" class="pi pi-check" style="font-size: 0.72rem" />
    </span>
  </div>
</template>
