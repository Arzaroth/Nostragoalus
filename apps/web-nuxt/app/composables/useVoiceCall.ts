import { effectScope } from 'vue'
import type { IceServersResponse, VoiceScope, VoiceSignalKind } from '#shared/types/voice'
import { voiceRoomKey } from '#shared/types/voice'
import type { ConnectionQuality } from '~/utils/voice'

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
// Display names for the roster ids, sent by the server with each roster push (a
// DM has no client-side member list to resolve names from).
const rosterNames = ref<Record<string, string>>({})
// Remote audio, keyed by peer user id - the UI binds each to a hidden <audio>.
const remoteStreams = ref<Record<string, MediaStream>>({})
const incoming = ref<IncomingRing | null>(null)
const muted = ref(false)
// Live "N in voice" state per league room key (count + who), for the badge shown
// to members who are not in the call. Fed by voice:presence broadcasts.
const roomPresence = ref<Record<string, { count: number; names: Record<string, string> }>>({})
// An i18n key for a surfaced error (mic denied, connect failed), else null.
const errorKey = ref<string | null>(null)
// Own mic level (0..1 RMS, 0 while muted) for the in-call meter.
const localLevel = ref(0)
// peerId -> currently speaking, for the participant list.
const speakingPeers = ref<Record<string, boolean>>({})
// Bumped (timestamp) when sustained speech is detected while muted - the UI
// toasts a "you're muted" nudge on each bump.
const mutedTalkingAt = ref(0)

// Worst per-peer link quality (from getStats), null until measured. Drives the
// call bar's quality indicator.
const connectionQuality = ref<ConnectionQuality | null>(null)
// True while a previously-connected peer link is down and being re-established.
const reconnecting = ref(false)

// Audio device selection (persisted): null = system default. Output selection
// only works where HTMLMediaElement.setSinkId exists (canPickOutput).
const inputDevices = ref<{ deviceId: string; label: string }[]>([])
const outputDevices = ref<{ deviceId: string; label: string }[]>([])
const inputDeviceId = ref<string | null>(null)
const outputDeviceId = ref<string | null>(null)
const noiseSuppression = ref(true)
const canPickOutput = ref(false)

const PREF_INPUT = 'ng-voice-input'
const PREF_OUTPUT = 'ng-voice-output'
const PREF_NOISE = 'ng-voice-noise-suppression'

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
  refreshDevices: () => Promise<void>
  setInputDevice: (deviceId: string | null) => Promise<void>
  setOutputDevice: (deviceId: string | null) => void
  setNoiseSuppression: (on: boolean) => Promise<void>
}

function start(): void {
  if (started || !import.meta.client) return
  started = true
  effectScope(true).run(() => {
    const { session } = useAuth()
    const myId = () => session.value?.data?.user?.id ?? null

    // Restore the persisted device/processing preferences.
    canPickOutput.value = 'setSinkId' in HTMLMediaElement.prototype
    inputDeviceId.value = localStorage.getItem(PREF_INPUT)
    outputDeviceId.value = canPickOutput.value ? localStorage.getItem(PREF_OUTPUT) : null
    noiseSuppression.value = localStorage.getItem(PREF_NOISE) !== 'off'

    const peers = new Map<string, RTCPeerConnection>()
    let localStream: MediaStream | null = null
    let iceConfig: RTCConfiguration | null = null
    let ringTimer: ReturnType<typeof setTimeout> | undefined
    // The callee we rang for an outgoing DM call, so a hang-up/timeout can cancel it.
    let outgoingCallee: string | null = null

    // Level metering: one AudioContext, an AnalyserNode per stream ('local' + each
    // peer), sampled on a timer. The local analyser taps a CLONE of the mic track
    // kept always-enabled, so speech is still measurable while muted (the mute
    // toggle disables only the track the peers receive) - that is what powers the
    // "you're muted" nudge.
    let audioCtx: AudioContext | null = null
    let monitorTrack: MediaStreamTrack | null = null
    const analysers = new Map<string, AnalyserNode>()
    let meterTimer: ReturnType<typeof setInterval> | undefined
    const mutedTracker = createMutedTalkingTracker()
    const METER_INTERVAL_MS = 150

    function attachAnalyser(key: string, stream: MediaStream): void {
      try {
        audioCtx ??= new AudioContext()
        void audioCtx.resume()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        audioCtx.createMediaStreamSource(stream).connect(analyser)
        analysers.set(key, analyser)
        meterTimer ??= setInterval(meterTick, METER_INTERVAL_MS)
      } catch {
        // Metering is best-effort cosmetics; a failed AudioContext never blocks the call.
      }
    }

    function meterTick(): void {
      const buf = new Uint8Array(256)
      const nextSpeaking: Record<string, boolean> = {}
      for (const [key, analyser] of analysers) {
        analyser.getByteTimeDomainData(buf)
        const level = levelFromSamples(buf)
        if (key === 'local') {
          localLevel.value = muted.value ? 0 : level
          if (mutedTracker.feed(muted.value, level, Date.now())) mutedTalkingAt.value = Date.now()
        } else {
          nextSpeaking[key] = level >= VOICE_SPEAKING_THRESHOLD
        }
      }
      speakingPeers.value = nextSpeaking
    }

    function teardownMetering(): void {
      clearInterval(meterTimer)
      meterTimer = undefined
      analysers.clear()
      monitorTrack?.stop()
      monitorTrack = null
      if (audioCtx) {
        void audioCtx.close().catch(() => {})
        audioCtx = null
      }
      mutedTracker.reset()
      localLevel.value = 0
      speakingPeers.value = {}
    }

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

    let iceFetchedAt = 0
    let iceTtlMs = 0
    async function ensureIce(): Promise<RTCConfiguration> {
      // The TURN credential is time-limited: refetch once 90% of its ttl has
      // passed so a later call (or an ICE restart) never starts on a dead cred.
      if (iceConfig && Date.now() - iceFetchedAt < iceTtlMs * 0.9) return iceConfig
      const res = await $fetch<IceServersResponse>('/api/voice/ice-servers')
      iceConfig = { iceServers: res.iceServers }
      iceFetchedAt = Date.now()
      iceTtlMs = res.ttl * 1000
      return iceConfig
    }

    async function acquireMic(): Promise<MediaStream> {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(inputDeviceId.value, noiseSuppression.value),
          video: false,
        })
      } catch (err) {
        // A remembered device may be unplugged; fall back to the default once.
        if (!inputDeviceId.value) throw err
        inputDeviceId.value = null
        localStorage.removeItem(PREF_INPUT)
        return await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(null, noiseSuppression.value),
          video: false,
        })
      }
    }

    // Tap a clone of the mic track (kept enabled) for the local level meter.
    function attachLocalMonitor(): void {
      const track = localStream?.getAudioTracks()[0]
      if (!track) return
      monitorTrack = track.clone()
      monitorTrack.enabled = true
      attachAnalyser('local', new MediaStream([monitorTrack]))
    }

    async function refreshDevices(): Promise<void> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        inputDevices.value = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label }))
        outputDevices.value = devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label }))
      } catch {
        // Device listing is optional UI sugar; the call works without it.
      }
    }

    async function ensureMic(): Promise<MediaStream> {
      if (localStream) return localStream
      try {
        localStream = await acquireMic()
      } catch {
        errorKey.value = 'voice.error.micDenied'
        throw new Error('mic denied')
      }
      // Honor a mute set before the mic was acquired.
      for (const track of localStream.getAudioTracks()) track.enabled = !muted.value
      attachLocalMonitor()
      // Labels only populate once the permission is granted, so (re)list now.
      void refreshDevices()
      return localStream
    }

    // Swap the mic (device or processing change) without renegotiating: acquire a
    // fresh track and replaceTrack it into every peer's audio sender.
    async function reacquireMic(): Promise<void> {
      if (!localStream) return
      let next: MediaStream
      try {
        next = await acquireMic()
      } catch {
        errorKey.value = 'voice.error.micDenied'
        return
      }
      const newTrack = next.getAudioTracks()[0] ?? null
      if (newTrack) {
        for (const pc of peers.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
          if (sender) {
            try {
              await sender.replaceTrack(newTrack)
            } catch {
              // A failed swap on one peer heals on the next reset; keep going.
            }
          }
        }
      }
      for (const track of localStream.getTracks()) track.stop()
      monitorTrack?.stop()
      analysers.delete('local')
      localStream = next
      for (const track of localStream.getAudioTracks()) track.enabled = !muted.value
      attachLocalMonitor()
    }

    // Self-healing: a peer link that drops (tab throttling, a network change, a
    // flaky hop) is re-established with an ICE restart instead of being dropped
    // for good. Only the deterministic offerer restarts (no glare); the other
    // side sees the same failure and waits for the fresh offer. Bounded attempts
    // so a truly dead link eventually drops.
    const RESTART_MAX_ATTEMPTS = 3
    const DISCONNECT_GRACE_MS = 3_000
    const restartAttempts = new Map<string, number>()
    const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
    // Peers that reached 'connected' at least once - only their downtime counts
    // as "reconnecting" (initial setup is 'connecting', not an outage).
    const everConnected = new Set<string>()

    async function restartPeer(peerId: string): Promise<void> {
      const pc = peers.get(peerId)
      if (!pc) return
      const attempt = (restartAttempts.get(peerId) ?? 0) + 1
      if (attempt > RESTART_MAX_ATTEMPTS) {
        dropPeer(peerId)
        return
      }
      restartAttempts.set(peerId, attempt)
      const self = myId()
      if (!self || !shouldOffer(self, peerId)) return
      try {
        await ensureIce()
        const offer = await pc.createOffer({ iceRestart: true })
        await pc.setLocalDescription(offer)
        socket.send({ type: 'voice:signal', to: peerId, kind: 'offer', payload: pc.localDescription })
      } catch {
        dropPeer(peerId)
      }
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
        attachAnalyser(peerId, e.streams[0])
      }
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === 'connected') {
          everConnected.add(peerId)
          restartAttempts.delete(peerId)
          clearTimeout(disconnectTimers.get(peerId))
          disconnectTimers.delete(peerId)
        } else if (st === 'disconnected') {
          // Often self-heals; give it a grace window before forcing a restart.
          clearTimeout(disconnectTimers.get(peerId))
          disconnectTimers.set(
            peerId,
            setTimeout(() => {
              if (peers.get(peerId)?.connectionState === 'disconnected') void restartPeer(peerId)
            }, DISCONNECT_GRACE_MS),
          )
        } else if (st === 'failed') {
          void restartPeer(peerId)
        } else if (st === 'closed') {
          dropPeer(peerId)
        }
      }
      peers.set(peerId, pc)
      ensureStatsLoop()
      return pc
    }

    // Poll each link's stats for the quality indicator: worst link wins, and a
    // previously-connected peer being down flags "reconnecting".
    let statsTimer: ReturnType<typeof setInterval> | undefined
    const STATS_INTERVAL_MS = 2_000
    function ensureStatsLoop(): void {
      statsTimer ??= setInterval(() => void statsTick(), STATS_INTERVAL_MS)
    }
    async function statsTick(): Promise<void> {
      const qualities: ConnectionQuality[] = []
      let anyDown = false
      for (const [peerId, pc] of peers) {
        const st = pc.connectionState
        if (st === 'connected') {
          try {
            const stats = await pc.getStats()
            const reports: Array<Record<string, unknown>> = []
            stats.forEach((r) => reports.push(r as unknown as Record<string, unknown>))
            qualities.push(qualityOf(extractQualityInputs(reports)))
          } catch {
            // A closing connection mid-poll; skip this tick.
          }
        } else if (everConnected.has(peerId)) {
          anyDown = true
        }
      }
      reconnecting.value = anyDown
      connectionQuality.value = anyDown ? 'poor' : worstQuality(qualities)
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
      analysers.delete(peerId)
      restartAttempts.delete(peerId)
      clearTimeout(disconnectTimers.get(peerId))
      disconnectTimers.delete(peerId)
      everConnected.delete(peerId)
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
            rosterNames.value = (data.names as Record<string, string>) ?? {}
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
        case 'voice:ended':
          // The other DM party left; the server already removed us from the room,
          // so no voice:leave is needed. Scope-checked so a stale frame from a
          // just-ended call cannot kill a new one.
          if (activeScope.value && voiceRoomKey(data.scope as VoiceScope) === voiceRoomKey(activeScope.value)) {
            cleanup()
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
          if (count > 0) next[key] = { count, names: (data.names as Record<string, string>) ?? {} }
          else delete next[key]
          roomPresence.value = next
          break
        }
      }
    }

    function cleanup(): void {
      clearTimeout(ringTimer)
      teardownMetering()
      clearInterval(statsTimer)
      statsTimer = undefined
      connectionQuality.value = null
      reconnecting.value = false
      for (const peerId of [...peers.keys()]) dropPeer(peerId)
      if (localStream) {
        for (const track of localStream.getTracks()) track.stop()
        localStream = null
      }
      remoteStreams.value = {}
      roster.value = []
      rosterNames.value = {}
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
      refreshDevices,
      async setInputDevice(deviceId) {
        inputDeviceId.value = deviceId
        if (deviceId) localStorage.setItem(PREF_INPUT, deviceId)
        else localStorage.removeItem(PREF_INPUT)
        await reacquireMic()
      },
      setOutputDevice(deviceId) {
        // Applied by the <VoiceAudio> elements watching outputDeviceId.
        outputDeviceId.value = deviceId
        if (deviceId) localStorage.setItem(PREF_OUTPUT, deviceId)
        else localStorage.removeItem(PREF_OUTPUT)
      },
      async setNoiseSuppression(on) {
        noiseSuppression.value = on
        localStorage.setItem(PREF_NOISE, on ? 'on' : 'off')
        await reacquireMic()
      },
    }

    navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshDevices())
  })
}

export function useVoiceCall() {
  start()
  const inCall = computed(() => state.value === 'connecting' || state.value === 'in-call' || state.value === 'outgoing')
  return {
    state: readonly(state),
    activeScope: readonly(activeScope),
    roster: readonly(roster),
    rosterNames: readonly(rosterNames),
    remoteStreams: readonly(remoteStreams),
    incoming: readonly(incoming),
    muted: readonly(muted),
    errorKey: readonly(errorKey),
    localLevel: readonly(localLevel),
    speakingPeers: readonly(speakingPeers),
    mutedTalkingAt: readonly(mutedTalkingAt),
    connectionQuality: readonly(connectionQuality),
    reconnecting: readonly(reconnecting),
    inputDevices: readonly(inputDevices),
    outputDevices: readonly(outputDevices),
    inputDeviceId: readonly(inputDeviceId),
    outputDeviceId: readonly(outputDeviceId),
    noiseSuppression: readonly(noiseSuppression),
    canPickOutput: readonly(canPickOutput),
    inCall,
    // Live "N in voice" count for a league room key (0 if none / unknown).
    voiceCountFor: (roomKey: string) => roomPresence.value[roomKey]?.count ?? 0,
    // Who is in a league room's call right now (display names, [] if none).
    voiceNamesFor: (roomKey: string) => Object.values(roomPresence.value[roomKey]?.names ?? {}),
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
    refreshDevices: () => impl?.refreshDevices(),
    setInputDevice: (deviceId: string | null) => impl?.setInputDevice(deviceId),
    setOutputDevice: (deviceId: string | null) => impl?.setOutputDevice(deviceId),
    setNoiseSuppression: (on: boolean) => impl?.setNoiseSuppression(on),
  }
}
