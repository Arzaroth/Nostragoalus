type ShareMode = 'sealed' | 'reveal' | 'result'
interface MintResult {
  token: string
  mode: ShareMode
  url: string
  imageUrl: string
}

// Mints a share-card link for one of the user's predictions and dispatches it:
// the native share sheet where available (mobile), otherwise clipboard. Also
// exposes explicit copy + download for desktop.
export function useShareCard() {
  const { locale, t } = useI18n()
  const toast = useToast()
  const busy = ref(false)

  async function mint(matchId: string, mode: ShareMode): Promise<MintResult> {
    return await $fetch<MintResult>('/api/share/mint', {
      method: 'POST',
      body: { matchId, mode, locale: locale.value },
    })
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true
    try {
      return await fn()
    } catch {
      toast.add({ severity: 'error', summary: t('share.failed'), life: 3000 })
    } finally {
      busy.value = false
    }
  }

  function toastCopied() {
    toast.add({ severity: 'success', summary: t('share.copied'), life: 2500 })
  }

  async function share(matchId: string, mode: ShareMode) {
    return run(async () => {
      const res = await mint(matchId, mode)
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ url: res.url })
          return res
        } catch (e) {
          // User dismissed the sheet: not an error, just stop.
          if (e instanceof DOMException && e.name === 'AbortError') return res
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(res.url)
        toastCopied()
      }
      return res
    })
  }

  async function copy(matchId: string, mode: ShareMode) {
    return run(async () => {
      const res = await mint(matchId, mode)
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(res.url)
        toastCopied()
      }
      return res
    })
  }

  async function download(matchId: string, mode: ShareMode) {
    return run(async () => {
      const res = await mint(matchId, mode)
      const blob = await (await fetch(res.imageUrl)).blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = 'nostragoalus-pick.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
      return res
    })
  }

  return { share, copy, download, busy }
}
