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
import {
  handleVoiceCancel,
  handleVoiceDecline,
  handleVoiceInvite,
  handleVoiceJoin,
  handleVoiceLeave,
  handleVoiceSignal,
} from '../utils/live/voice'
import { parseVoiceScope, type VoiceSignalKind } from '../../shared/types/voice'

const peers = new WeakMap<object, LiveSubscriber>()

// Dispatch a validated voice:* frame to its handler. Kept thin - the authorization
// and room logic live in server/utils/live/voice (under the coverage gate); this
// only shapes untrusted client input. A handler that throws (an authz rejection)
// bubbles to the message handler's catch, which ignores it.
async function handleVoiceFrame(sub: LiveSubscriber, data: Record<string, unknown>): Promise<void> {
  const asStr = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null)
  switch (data.type) {
    case 'voice:join': {
      const scope = parseVoiceScope(data.scope)
      if (scope) await handleVoiceJoin(db, sub, scope)
      break
    }
    case 'voice:leave':
      await handleVoiceLeave(db, sub)
      break
    case 'voice:signal': {
      const to = asStr(data.to)
      const kind = data.kind as VoiceSignalKind
      // Cap the relayed SDP/ICE size so an authorized peer can't amplify a huge
      // payload at a co-participant (a real SDP is a few KB; ICE candidates tiny).
      const withinSize = JSON.stringify(data.payload ?? null).length <= 16_384
      if (to && withinSize && (kind === 'offer' || kind === 'answer' || kind === 'ice')) {
        handleVoiceSignal(sub, to, kind, data.payload)
      }
      break
    }
    case 'voice:invite': {
      const scope = parseVoiceScope(data.scope)
      const userIds = Array.isArray(data.userIds)
        ? (data.userIds.filter((x) => typeof x === 'string' && x.length <= 64) as string[]).slice(0, 50)
        : []
      if (scope && userIds.length) await handleVoiceInvite(db, sub, scope, userIds)
      break
    }
    case 'voice:decline': {
      const scope = parseVoiceScope(data.scope)
      const to = asStr(data.to)
      if (scope && to) await handleVoiceDecline(db, sub, scope, to)
      break
    }
    case 'voice:cancel': {
      const scope = parseVoiceScope(data.scope)
      const to = asStr(data.to)
      if (scope && to) await handleVoiceCancel(db, sub, scope, to)
      break
    }
  }
}

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
      if (data?.type === 'ping') {
        // Client keepalive/half-open detector (see app/utils/heartbeat.ts).
        // Answer immediately; no auth or state needed.
        peer.send(JSON.stringify({ type: 'pong' }))
      } else if (data?.type === 'subscribe' && Array.isArray(data.matchIds)) {
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
      } else if (typeof data?.type === 'string' && data.type.startsWith('voice:') && subscriber.userId) {
        // WebRTC signaling. The server relays call control + SDP/ICE; the media is
        // peer-to-peer and never touches it. Scope is validated here (untrusted) and
        // re-authorized server-side in the handlers.
        await handleVoiceFrame(subscriber, data)
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
      // Leave any voice call before dropping the subscriber, so the decremented
      // roster reaches the remaining participants (they tear down this peer). The
      // close hook is sync, so this is fire-and-forget.
      void handleVoiceLeave(db, subscriber)
      removeLiveSubscriber(subscriber)
      // Drop it from its viewer room after leaving the subscriber set, so the
      // decremented "N watching now" reaches the remaining viewers, not itself.
      dropMatchViewer(subscriber)
      peers.delete(peer)
    }
  },
})
