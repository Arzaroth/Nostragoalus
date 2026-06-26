interface FeedSubscription {
  url: string
  webcalUrl: string
}

// Fetches the user's calendar-feed subscription URL on demand (the URL is a
// capability token, so it is revealed on a click rather than shown eagerly) and
// copies it to the clipboard.
export function useCalendarFeed() {
  const { locale, t } = useI18n()
  const toast = useToast()
  const data = ref<FeedSubscription | null>(null)
  const busy = ref(false)

  async function load() {
    if (busy.value || data.value) return
    busy.value = true
    try {
      data.value = await $fetch<FeedSubscription>('/api/feed/subscription', { query: { locale: locale.value } })
    } catch {
      toast.add({ severity: 'error', summary: t('feed.failed'), life: 3000 })
    } finally {
      busy.value = false
    }
  }

  async function copy() {
    const url = data.value?.url
    if (!url || typeof navigator === 'undefined' || !navigator.clipboard) return
    await navigator.clipboard.writeText(url)
    toast.add({ severity: 'success', summary: t('feed.copied'), life: 2500 })
  }

  return { data, busy, load, copy }
}
