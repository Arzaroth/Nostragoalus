import { auth } from '../../lib/auth'
import { db } from '../../db'
import {
  addLiveSubscriber,
  dropMatchViewer,
  presenceConnect,
  presenceDisconnect,
  presenceSetIdle,
  presenceSnapshot,
  removeLiveSubscriber,
  sendMatchSnapshot,
  syncMatchViewers,
  type LiveSubscriber,
} from '../utils/live/hub'
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
    // The peer may have closed while the session lookup was awaiting; close() ran
    // with userId still null, so bringing the user online now would leak a
    // ref-count that never gets decremented. Bail before touching presence.
    if (subscriber.closed) return
    // Mark this user online (broadcast to all) and hand the new client the current
    // presence of everyone else.
    if (subscriber.userId) {
      presenceConnect(subscriber.userId)
      try {
        subscriber.send({ type: 'presence:snapshot', users: presenceSnapshot() })
      } catch {
        // socket already closing; the close hook will undo the presence bump
      }
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
      } else if (data?.type === 'presence:ping' && subscriber.userId) {
        // The client reports active/idle (it tracks its own 15-min idle timer).
        presenceSetIdle(subscriber.userId, data.active === false)
      } else if (data?.type === 'viewing') {
        // The match page reports the one match this socket is watching, so its
        // per-match "N watching now" room counts it (and only it - distinct from
        // the `subscribe` frame the fixtures list sends for every visible match).
        // A missing/blank matchId clears this socket from its room. Cap the
        // length so a hostile frame can't mint a giant room-map key (ids are
        // short uuids; an over-long value is junk and just clears instead).
        const raw = data.matchId
        const matchId = typeof raw === 'string' && raw && raw.length <= 64 ? raw : null
        syncMatchViewers(subscriber, matchId ? [matchId] : [])
      }
    } catch {
      // ignore malformed client messages
    }
  },

  close(peer) {
    const subscriber = peers.get(peer)
    if (subscriber) {
      subscriber.closed = true
      if (subscriber.userId) presenceDisconnect(subscriber.userId)
      removeLiveSubscriber(subscriber)
      // Drop it from its viewer room after leaving the subscriber set, so the
      // decremented "N watching now" reaches the remaining viewers, not itself.
      dropMatchViewer(subscriber)
      peers.delete(peer)
    }
  },
})
