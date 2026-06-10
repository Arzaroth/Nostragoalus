import { auth } from '../../lib/auth'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from '../utils/live/hub'

const peers = new WeakMap<object, LiveSubscriber>()

export default defineWebSocketHandler({
  async open(peer) {
    // Register synchronously so a subscribe message or close that arrives while
    // the session lookup is still awaiting is not lost (crossws does not
    // serialize hooks). userId is patched in once resolved - league-scoped
    // pushes reach members only; guests still get the global broadcasts.
    const subscriber: LiveSubscriber = {
      matchIds: new Set(),
      userId: null,
      send: (payload) => peer.send(JSON.stringify(payload)),
    }
    peers.set(peer, subscriber)
    addLiveSubscriber(subscriber)
    try {
      const session = await auth.api.getSession({ headers: peer.request.headers })
      subscriber.userId = session?.user?.id ?? null
    } catch {
      // anonymous connection
    }
  },

  message(peer, message) {
    const subscriber = peers.get(peer)
    if (!subscriber) return
    try {
      const data = JSON.parse(message.text())
      if (data?.type === 'subscribe' && Array.isArray(data.matchIds)) {
        subscriber.matchIds = new Set(data.matchIds.map(String))
      }
    } catch {
      // ignore malformed client messages
    }
  },

  close(peer) {
    const subscriber = peers.get(peer)
    if (subscriber) {
      removeLiveSubscriber(subscriber)
      peers.delete(peer)
    }
  },
})
