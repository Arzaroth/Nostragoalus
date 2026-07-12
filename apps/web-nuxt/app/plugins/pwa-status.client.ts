// Surfaces the "downloading" PWA phase. While a new service worker precaches
// the next build, PwaBanner shows progress instead of the reload banner
// appearing out of nowhere the instant the background download finishes.
export default defineNuxtPlugin((nuxtApp) => {
  const downloading = useState('sw-downloading', () => false)

  nuxtApp.hook('service-worker:registered', ({ registration }) => {
    if (!registration) return
    const track = (worker: ServiceWorker | null) => {
      // No controller means this is the first install (initial precache on a
      // fresh visit): the app already works via SSR, so it isn't an update the
      // user is waiting on. Only downloads that replace a controlled page count.
      if (!worker || !navigator.serviceWorker.controller) return
      const sync = () => {
        downloading.value = worker.state === 'installing'
      }
      sync()
      worker.addEventListener('statechange', sync)
    }
    track(registration.installing)
    registration.addEventListener('updatefound', () => track(registration.installing))
  })
})
