import { effectScope } from 'vue'
import type { IceServersResponse, VoiceScope, VoiceSignalKind } from '#shared/types/voice'
import { voiceRoomKey } from '#shared/types/voice'

// App-wide voice-call singleton (one per tab), modeled on usePresence: one detached
// scope owns a dedicated WS socket for signaling and the RTCPeerConnection mesh, so
// an incoming ring reaches the user anywhere in the app. Audio only, one active
// call per tab. Media is peer-to-peer (DTLS-SRTP); only SDP/ICE crosses the socket.
// The pure mesh logic (who offers, roster diff) lives in app/utils/voice.

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'in-call'
export interface IncomingRing {
  scope: VoiceScope
  from: string
  fromName: string
}

// 30s of ringing with no answer = a missed call (the server records it on cancel).
const RING_TIMEOUT_MS = 30_000

const state = ref<CallState>('idle')
const activeScope = ref<VoiceScope | null>(null)
// User ids in the current room, including self (the mesh roster).
const roster = ref<string[]>([])
// Remote audio, keyed by peer user id - the UI binds each to a hidden <audio>.
const remoteStreams = ref<Record<string, MediaStream>>({})
const incoming = ref<IncomingRing | null>(null)
const muted = ref(false)
// Live "N in voice" counts per league room key, for the badge shown to members who
// are not in the call. Fed by voice:presence broadcasts.
const roomPresence = ref<Record<string, number>>({})
// An i18n key for a surfaced error (mic denied, connect failed), else null.
const errorKey = ref<string | null>(null)

let started = false
let impl: VoiceImpl | null = null

interface VoiceImpl {
  send: (payload: unknown) => boolean
  myId: () => string | null
  startDmCall: (threadId: string, calleeId: string) => Promise<void>
  joinLeagueVoice: (leagueId: string, matchId: string | null) => Promise<void>
  accept: () => Promise<void>
  decline: () => void
  hangup: () => void
  invite: (userIds: string[]) => void
  toggleMute: () => void
}

function start(): void {
  if (started || !import.meta.client) return
  started = true
  effectScope(true).run(() => {
    const { session } = useAuth()
    const myId = () => session.value?.data?.user?.id ?? null

    const peers = new Map<string, RTCPeerConnection>()
    let localStream: MediaStream | null = null
    let iceConfig: RTCConfiguration | null = null
    let ringTimer: ReturnType<typeof setTimeout> | undefined
    // The callee we rang for an outgoing DM call, so a hang-up/timeout can cancel it.
    let outgoingCallee: string | null = null

    const socket = useReconnectingSocket({
      onMessage: (data) => handleFrame(data as Record<string, unknown>),
      onOpen: () => {
        // After a reconnect, re-announce our presence in the call so the server
        // re-seats this socket as our endpoint and re-rosters the room. Includes
        // 'outgoing': a DM caller mid-ring has already joined the room, so a flap
        // would otherwise drop their seat and the answered call would never connect.
        if (
          activeScope.value &&
          (state.value === 'in-call' || state.value === 'connecting' || state.value === 'outgoing')
        ) {
          socket.send({ type: 'voice:join', scope: activeScope.value })
        }
      },
    })

    async function ensureIce(): Promise<RTCConfiguration> {
      if (iceConfig) return iceConfig
      const res = await $fetch<IceServersResponse>('/api/voice/ice-servers')
      iceConfig = { iceServers: res.iceServers }
      return iceConfig
    }

    async function ensureMic(): Promise<MediaStream> {
      if (localStream) return localStream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch {
        errorKey.value = 'voice.error.micDenied'
        throw new Error('mic denied')
      }
      // Honor a mute set before the mic was acquired.
      for (const track of localStream.getAudioTracks()) track.enabled = !muted.value
      return localStream
    }

    function ensurePeer(peerId: string): RTCPeerConnection {
      const existing = peers.get(peerId)
      if (existing) return existing
      const pc = new RTCPeerConnection(iceConfig ?? undefined)
      if (localStream) for (const track of localStream.getTracks()) pc.addTrack(track, localStream)
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.send({ type: 'voice:signal', to: peerId, kind: 'ice', payload: e.candidate })
      }
      pc.ontrack = (e) => {
        remoteStreams.value = { ...remoteStreams.value, [peerId]: e.streams[0] }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(peerId)
      }
      peers.set(peerId, pc)
      return pc
    }

    async function offerTo(peerId: string): Promise<void> {
      try {
        const pc = ensurePeer(peerId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.send({ type: 'voice:signal', to: peerId, kind: 'offer', payload: pc.localDescription })
      } catch {
        // A failed offer (e.g. the peer left mid-negotiation) is contained here
        // rather than surfacing as an unhandled rejection; the peer heals on the
        // next roster/reset or is dropped by its connection-state watcher.
      }
    }

    function dropPeer(peerId: string): void {
      const pc = peers.get(peerId)
      if (pc) {
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.close()
        peers.delete(peerId)
      }
      if (remoteStreams.value[peerId]) {
        const next = { ...remoteStreams.value }
        delete next[peerId]
        remoteStreams.value = next
      }
    }

    function reconcile(newRoster: string[]): void {
      const self = myId()
      if (!self) return
      const { added, removed } = rosterDelta(peers.keys(), newRoster, self)
      for (const peerId of removed) dropPeer(peerId)
      // Only the deterministic offerer of each pair sends the offer; the other
      // waits for it (no glare). Late joiners connect the same way.
      for (const peerId of added) {
        ensurePeer(peerId)
        if (shouldOffer(self, peerId)) void offerTo(peerId)
      }
    }

    async function handleSignal(from: string, kind: VoiceSignalKind, payload: unknown): Promise<void> {
      const pc = ensurePeer(from)
      try {
        if (kind === 'offer') {
          await pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.send({ type: 'voice:signal', to: from, kind: 'answer', payload: pc.localDescription })
        } else if (kind === 'answer') {
          await pc.setRemoteDescription(payload as RTCSessionDescriptionInit)
        } else {
          await pc.addIceCandidate(payload as RTCIceCandidateInit)
        }
      } catch {
        // A malformed or out-of-order SDP/ICE frame (glare, a candidate before the
        // remote description) is contained rather than surfacing as an unhandled
        // rejection; the connection heals on renegotiation or is dropped on failure.
      }
    }

    function handleFrame(data: Record<string, unknown>): void {
      switch (data.type) {
        case 'voice:roster': {
          if (activeScope.value && data.roomKey === voiceRoomKey(activeScope.value)) {
            roster.value = (data.roster as string[]) ?? []
            reconcile(roster.value)
            if (
              activeScope.value &&
              (state.value === 'outgoing' || state.value === 'connecting') &&
              isCallEstablished(activeScope.value.kind, roster.value.length)
            ) {
              state.value = 'in-call'
            }
          }
          break
        }
        case 'voice:ring': {
          // Busy: auto-decline the new ring so the caller isn't left hanging.
          if (state.value !== 'idle') {
            socket.send({ type: 'voice:decline', scope: data.scope, to: data.from })
            break
          }
          incoming.value = { scope: data.scope as VoiceScope, from: String(data.from), fromName: String(data.fromName) }
          state.value = 'incoming'
          break
        }
        case 'voice:signal':
          void handleSignal(String(data.from), data.kind as VoiceSignalKind, data.payload)
          break
        case 'voice:declined':
          // The callee declined. Leave the room we joined when we started ringing,
          // then drop locally - otherwise the server keeps us as a phantom member.
          if (state.value === 'outgoing') {
            socket.send({ type: 'voice:leave' })
            cleanup()
          }
          break
        case 'voice:cancelled':
          if (state.value === 'incoming') {
            incoming.value = null
            state.value = 'idle'
          }
          break
        case 'voice:evicted':
          // Another tab of ours took the call over; drop this tab's silently. The
          // server already removed this token, so no voice:leave is needed.
          cleanup()
          break
        case 'voice:peer-reset': {
          // A peer re-joined from a new tab (a takeover). Our connection to them is
          // now dead; drop it and re-establish, letting the deterministic offerer
          // rule pick which side sends the fresh offer (the other side waits).
          const uid = String(data.userId)
          const self = myId()
          if (self && uid !== self) {
            dropPeer(uid)
            ensurePeer(uid)
            if (shouldOffer(self, uid)) void offerTo(uid)
          }
          break
        }
        case 'voice:presence': {
          // A league room's live count for the "N in voice" badge.
          const key = String(data.roomKey)
          const count = Number(data.count) || 0
          const next = { ...roomPresence.value }
          if (count > 0) next[key] = count
          else delete next[key]
          roomPresence.value = next
          break
        }
      }
    }

    function cleanup(): void {
      clearTimeout(ringTimer)
      for (const peerId of [...peers.keys()]) dropPeer(peerId)
      if (localStream) {
        for (const track of localStream.getTracks()) track.stop()
        localStream = null
      }
      remoteStreams.value = {}
      roster.value = []
      activeScope.value = null
      incoming.value = null
      outgoingCallee = null
      muted.value = false
      state.value = 'idle'
    }

    // Acquire the mic + ICE config and announce our join. Returns false (and tears
    // down) if the mic was denied, so callers can bail without re-reading state.
    async function enter(scope: VoiceScope, next: CallState): Promise<boolean> {
      errorKey.value = null
      activeScope.value = scope
      state.value = next
      try {
        await ensureIce()
        await ensureMic()
      } catch {
        cleanup()
        return false
      }
      socket.send({ type: 'voice:join', scope })
      return true
    }

    impl = {
      send: socket.send,
      myId,
      async startDmCall(threadId, calleeId) {
        if (state.value !== 'idle') return
        outgoingCallee = calleeId
        const scope: VoiceScope = { kind: 'dm', threadId }
        if (!(await enter(scope, 'outgoing'))) return
        socket.send({ type: 'voice:invite', scope, userIds: [calleeId] })
        ringTimer = setTimeout(() => {
          if (state.value === 'outgoing') this.hangup()
        }, RING_TIMEOUT_MS)
      },
      async joinLeagueVoice(leagueId, matchId) {
        if (state.value !== 'idle') return
        await enter({ kind: 'league', leagueId, matchId }, 'connecting')
      },
      async accept() {
        const ring = incoming.value
        if (!ring) return
        incoming.value = null
        await enter(ring.scope, 'connecting')
      },
      decline() {
        const ring = incoming.value
        if (!ring) return
        socket.send({ type: 'voice:decline', scope: ring.scope, to: ring.from })
        incoming.value = null
        state.value = 'idle'
      },
      hangup() {
        const scope = activeScope.value
        if (scope) {
          socket.send({ type: 'voice:leave' })
          // Cancelling an unanswered outgoing DM ring records the miss for the callee.
          if (state.value === 'outgoing' && outgoingCallee) {
            socket.send({ type: 'voice:cancel', scope, to: outgoingCallee })
          }
        }
        cleanup()
      },
      invite(userIds) {
        if (activeScope.value && userIds.length) {
          socket.send({ type: 'voice:invite', scope: activeScope.value, userIds })
        }
      },
      toggleMute() {
        muted.value = !muted.value
        if (localStream) for (const track of localStream.getAudioTracks()) track.enabled = !muted.value
      },
    }
  })
}

export function useVoiceCall() {
  start()
  const inCall = computed(() => state.value === 'connecting' || state.value === 'in-call' || state.value === 'outgoing')
  return {
    state: readonly(state),
    activeScope: readonly(activeScope),
    roster: readonly(roster),
    remoteStreams: readonly(remoteStreams),
    incoming: readonly(incoming),
    muted: readonly(muted),
    errorKey: readonly(errorKey),
    inCall,
    // Live "N in voice" count for a league room key (0 if none / unknown).
    voiceCountFor: (roomKey: string) => roomPresence.value[roomKey] ?? 0,
    // Whether this tab is currently in the call for the given scope.
    isInScope: (scope: VoiceScope) => activeScope.value != null && voiceRoomKey(activeScope.value) === voiceRoomKey(scope),
    // Actions (no-ops until the client singleton has started).
    startDmCall: (threadId: string, calleeId: string) => impl?.startDmCall(threadId, calleeId),
    joinLeagueVoice: (leagueId: string, matchId: string | null) => impl?.joinLeagueVoice(leagueId, matchId),
    accept: () => impl?.accept(),
    decline: () => impl?.decline(),
    hangup: () => impl?.hangup(),
    invite: (userIds: string[]) => impl?.invite(userIds),
    toggleMute: () => impl?.toggleMute(),
  }
}
