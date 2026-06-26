import { auth } from '../../lib/auth'
import { db } from '../../db'
import { addLiveSubscriber, removeLiveSubscriber, sendMatchSnapshot, type LiveSubscriber } from '../utils/live/hub'
import { publishTyping } from '../utils/live/league-chat'

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

  async message(peer, message) {
    const subscriber = peers.get(peer)
    if (!subscriber) return
    try {
      const data = JSON.parse(message.text())
      if (data?.type === 'subscribe' && Array.isArray(data.matchIds)) {
        subscriber.matchIds = new Set(data.matchIds.map(String))
        // Converge this client immediately: a transition it missed while
        // disconnected (e.g. full-time) would otherwise stick until reload.
        await sendMatchSnapshot(db, subscriber)
      } else if (data?.type === 'chat:typing' && typeof data.leagueId === 'string' && subscriber.userId) {
        // Ephemeral typing hint - members only (publishTyping checks membership).
        const matchId = typeof data.matchId === 'string' ? data.matchId : null
        await publishTyping(db, { leagueId: data.leagueId, matchId, userId: subscriber.userId, nowMs: Date.now() })
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
