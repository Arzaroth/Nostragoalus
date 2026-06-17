// VAPID public keys are URL-safe base64; the browser's subscribe() wants a
// Uint8Array applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  // Back it with an explicit ArrayBuffer so the type is a concrete
  // Uint8Array<ArrayBuffer>, which applicationServerKey (BufferSource) accepts.
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Drives the "enable push on this device" control: capability detection, the
// browser permission, and subscribe/unsubscribe against pushManager + the API.
export function usePushNotifications() {
  const config = useRuntimeConfig()
  const vapidKey = (config.public.vapidPublicKey as string) || ''

  const supported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const subscribed = ref(false)
  const busy = ref(false)

  onMounted(async () => {
    supported.value =
      !!vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported.value) return
    permission.value = Notification.permission
    const reg = await navigator.serviceWorker.ready
    subscribed.value = !!(await reg.pushManager.getSubscription())
  })

  async function subscribe(): Promise<void> {
    if (!supported.value || busy.value) return
    busy.value = true
    try {
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const json = sub.toJSON()
      // A standards-compliant subscription always carries both keys; if a browser
      // returns a key-less one, don't POST it (the server requires them) and tear
      // the orphan browser subscription back down instead of leaving it dangling.
      if (!json.keys?.p256dh || !json.keys?.auth) {
        await sub.unsubscribe().catch(() => {})
        return
      }
      await $fetch('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
      })
      subscribed.value = true
    } finally {
      busy.value = false
    }
  }

  async function unsubscribe(): Promise<void> {
    if (!supported.value || busy.value) return
    busy.value = true
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
        await sub.unsubscribe()
      }
      subscribed.value = false
    } finally {
      busy.value = false
    }
  }

  return { supported, permission, subscribed, busy, subscribe, unsubscribe }
}
