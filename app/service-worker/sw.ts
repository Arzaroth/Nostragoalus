/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// Precache the build's static assets (the manifest is injected here by
// vite-pwa). No navigation route: this SSR app always hits the server.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
clientsClaim()

// registerType is 'prompt', so the new SW waits until the in-app update banner
// posts SKIP_WAITING (workbox-window's messageSkipWaiting). Honour it here.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') self.skipWaiting()
})

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: PushPayload
  try {
    payload = event.data.json() as PushPayload
  } catch {
    return
  }
  if (!payload?.title) return
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // A tag collapses repeat pushes about the same thing (e.g. a match) into
      // one notification instead of stacking.
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only ever navigate within our own origin. Server payloads always carry a
  // relative path, but a system-notification click must never be able to open an
  // arbitrary site, so resolve against our origin and fall back to '/' otherwise.
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  let url = '/'
  try {
    const resolved = new URL(raw, self.location.origin)
    if (resolved.origin === self.location.origin) url = resolved.pathname + resolved.search + resolved.hash
  } catch {
    // keep '/'
  }
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Focus an existing tab already on the target, otherwise open one.
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      const existing = clientList.find((c) => 'focus' in c)
      if (existing) {
        await existing.focus()
        return existing.navigate?.(url)
      }
      return self.clients.openWindow(url)
    })(),
  )
})
