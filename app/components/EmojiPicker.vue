<script setup lang="ts">
// Quick-insert emoji popover for the chat composer. Raw Unicode only (not the
// curated, skinnable reaction glyphs), inserted into the message text. Stays open
// after a pick so several can be added; closes on Esc or an outside click.
import { onClickOutside } from '@vueuse/core'
import { EMOJI_CATEGORIES, searchEmoji, type EmojiItem } from '~/utils/emoji-data'

const emit = defineEmits<{ select: [string]; close: [] }>()
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const searchEl = ref<{ $el?: HTMLElement } | null>(null)
const query = ref('')
const activeCat = ref(EMOJI_CATEGORIES[0]!.key)

const shown = computed<EmojiItem[]>(() => {
  if (query.value.trim()) return searchEmoji(query.value)
  return EMOJI_CATEGORIES.find((c) => c.key === activeCat.value)?.items ?? []
})

onClickOutside(root, () => emit('close'))
onMounted(() => {
  nextTick(() => {
    const el = searchEl.value?.$el
    const inp = (el?.tagName === 'INPUT' ? el : el?.querySelector?.('input')) as HTMLInputElement | undefined
    inp?.focus()
  })
})
</script>

<template>
  <div
    ref="root"
    class="rounded-xl border shadow-xl flex flex-col overflow-hidden"
    style="width: 18rem; background: var(--p-content-background); border-color: var(--p-content-border-color)"
    @keydown.esc.stop="emit('close')"
  >
    <div class="p-2 border-b" style="border-color: var(--p-content-border-color)">
      <InputText ref="searchEl" v-model="query" :placeholder="t('chat.emoji.search')" class="w-full" size="small" />
    </div>
    <div v-show="!query.trim()" class="flex items-center gap-0.5 px-2 pt-2 flex-wrap">
      <button
        v-for="c in EMOJI_CATEGORIES"
        :key="c.key"
        type="button"
        v-tooltip.top="t(`chat.emoji.cat.${c.key}`)"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-base leading-none"
        :style="activeCat === c.key ? 'background: color-mix(in srgb, var(--p-primary-color) 18%, transparent)' : ''"
        :aria-label="t(`chat.emoji.cat.${c.key}`)"
        @click="activeCat = c.key"
      >{{ c.items[0]!.e }}</button>
    </div>
    <div class="p-2 overflow-y-auto" style="max-height: 14rem">
      <p v-if="!shown.length" class="text-xs text-center py-4" style="color: var(--p-text-muted-color)">{{ t('chat.emoji.none') }}</p>
      <div v-else class="grid grid-cols-8 gap-0.5">
        <button
          v-for="(it, i) in shown"
          :key="i"
          type="button"
          class="w-8 h-8 rounded-lg text-xl leading-none flex items-center justify-center hover:scale-110 transition-transform"
          @click="emit('select', it.e)"
        >{{ it.e }}</button>
      </div>
    </div>
  </div>
</template>
