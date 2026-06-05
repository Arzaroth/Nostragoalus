import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from '../utils/live/hub'

const peers = new WeakMap<object, LiveSubscriber>()

export default defineWebSocketHandler({
  open(peer) {
    const subscriber: LiveSubscriber = {
      matchIds: new Set(),
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
