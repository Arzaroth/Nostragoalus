import { auth } from '../../lib/auth'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from '../utils/live/hub'

const peers = new WeakMap<object, LiveSubscriber>()

export default defineWebSocketHandler({
  async open(peer) {
    // Identify the connection so league-scoped pushes reach members only;
    // guests still get the global broadcasts.
    let userId: string | null = null
    try {
      const session = await auth.api.getSession({ headers: peer.request.headers })
      userId = session?.user?.id ?? null
    } catch {
      // anonymous connection
    }
    const subscriber: LiveSubscriber = {
      matchIds: new Set(),
      userId,
      send: (payload) => peer.send(JSON.stringify(payload)),
    }
    peers.set(peer, subscriber)
    addLiveSubscriber(subscriber)
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
