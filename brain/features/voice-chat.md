# Voice chat

Audio calls inside the existing chat surface: 1:1 calls in a DM, and small group
voice rooms in a league (optionally scoped to a match - "watch this game together
on voice"). Peer-to-peer WebRTC (a full mesh); the server only relays signaling.
Back to the catalog: [index.md](index.md). The transport it rides:
[../architecture/webrtc.md](../architecture/webrtc.md) and
[../architecture/realtime.md](../architecture/realtime.md).

## What the user sees

- **DM:** a Call button in the DM chat header. Pressing it rings the other person;
  they get an app-wide incoming-call dialog (Accept / Decline). Unanswered or
  offline -> a missed-call notification (bell + web push, the new "Calls"
  category). While connected, an in-call bar (mute, audio settings, hang-up, a
  timer) floats above the chat dock. Either side hanging up ends the call for
  both.
- **League:** a Join-voice button in the league chat header, carrying a live
  "N in voice" badge (its tooltip names who is in) so members see a call is
  happening without being in it. Inside the call, an Invite control rings chosen
  members. The room is ephemeral - it exists while at least one person is in it.
- Ringing has sound: WebAudio-synthesized tones (no audio assets) - a 440+480Hz
  dual ring for an incoming call, a 425Hz ringback while dialing - loop while
  the call state is incoming/outgoing and stop on any transition. Best-effort:
  autoplay policy can block a gestureless incoming ring, so the ring dialog
  stays the guaranteed signal.
- The in-call bar lists the other participants (names ride the roster frames),
  lights a speaker's name while they talk (color only - a weight change would
  shift the bar's width per utterance; held for `SPEAKING_HOLD_MS` past the last
  threshold crossing via `createSpeakingTracker`, because raw RMS dips between
  syllables and the highlight would strobe), and shows a 5-bar waveform meter
  for the local mic whose heights follow the RMS level continuously
  (`meterBarHeights` in `apps/web-nuxt/app/utils/voice.ts`). The muted state
  draws the mic icon with a strike overlay because primeicons ships no
  `microphone-slash` glyph (an unknown class renders an empty, unclickable
  icon). Talking while muted flashes a throttled "you're muted" bubble directly
  above the call bar (not a toast - the eyes are on the bar during a call).
- An audio-settings dialog picks the input/output device (persisted in
  localStorage, output only where `setSinkId` exists) and toggles noise
  suppression; echo cancellation + auto gain are always requested.
- Chat timelines (DM + league) interleave **call lines** - started / ended (with
  duration) / missed - from the `voice_call` log, refreshed live by a `voice:log`
  push.
- Audio only (no video/screen share in v1).

## How it works

Media is **peer-to-peer, never through the server**. Each pair of participants
holds one `RTCPeerConnection` (DTLS-SRTP), so a call is end-to-end encrypted by
construction - the same privacy stance as the E2EE chat, and the reason the
topology is a **mesh, not an SFU** (an SFU would terminate the media server-side).
See [../decisions.md](../decisions.md).

### Signaling (server)

Rides the one in-process [WebSocket hub](../architecture/realtime.md) - no new
transport. The frames (`voice:*`) are validated and dispatched in
`apps/web-nuxt/server/routes/_ws.ts`; the logic lives in `apps/web-nuxt/server/utils/live/voice.ts` (under the
coverage gate), with the send primitives in `apps/web-nuxt/server/utils/live/hub.ts`:

- `voice:join` / `voice:leave` - enter/leave the call for a scope. The server
  authorizes the scope (`apps/web-nuxt/server/utils/voice/service.ts` `resolveVoiceScope`,
  reusing DM-participant + league-member checks), seats the socket in the room
  (`apps/web-nuxt/server/utils/live/voice-rooms.ts`) and fans the roster to the room.
- `voice:signal` - relays one SDP offer/answer or ICE candidate to another
  participant. Authorized purely by live room membership (both peers must be in the
  same room), so there is no per-signal DB hit and no way to push signaling at a
  user who is not in the call.
- `voice:invite` - rings members; an offline target is recorded as a missed call
  immediately. `voice:decline` / `voice:cancel` - clear the other side's UI;
  cancel of an unanswered ring records the miss.
- `voice:roster` (participant ids + display names) and `voice:presence` (a league
  room's count + names to every league member, for the badge) go back out.
- **DM teardown:** a DM is a two-party call, so one side leaving force-drops the
  remainer and sends them `voice:ended` - no zombie "in-call" state. League rooms
  just shrink.
- `voice:log` - fanned to the scope's audience whenever the call log changes
  (opened / ended / missed) so open chats refetch their call lines.

**One endpoint per user per room:** `voice-rooms.ts` keeps a single socket per user
in a room, so a second tab joining takes the call over (the old tab is evicted) -
one mic per person, and signaling targets the one participating tab.

### The mesh (client)

`apps/web-nuxt/app/composables/useVoiceCall.ts` is an app-wide singleton (one per tab, like
[`usePresence`](../architecture/realtime.md)) owning a dedicated signaling socket
and the peer-connection map. The glare-free offerer rule and roster diff are pure
and unit-tested in `apps/web-nuxt/app/utils/voice.ts`:

- On a `voice:roster` frame it diffs the peer set (`rosterDelta`) and, for each new
  peer, the lexicographically smaller id offers (`shouldOffer`) while the other
  waits - so exactly one side of each pair offers, and late joiners connect the
  same way (no glare, no full perfect-negotiation needed for audio-only).
- Mic via `getUserMedia` with `buildAudioConstraints` (echo cancellation + auto
  gain always, noise suppression toggleable, chosen device pinned `exact` with a
  fallback to default if it vanished); a denial surfaces an error toast. Remote
  streams are keyed by peer for the hidden `<audio>` elements (`VoiceAudio.vue`,
  which also applies the chosen `sinkId`). Mute toggles the local track. A device
  switch re-acquires and `replaceTrack`s into every peer's sender (no
  renegotiation). On a socket reconnect it re-joins so the room heals.
- Level metering: one `AudioContext`, an `AnalyserNode` per stream. The local
  analyser taps a CLONE of the mic track kept enabled while muted - that is what
  detects talking-while-muted (`createMutedTalkingTracker`, pure + tested in
  `apps/web-nuxt/app/utils/voice.ts` with `levelFromSamples`).
- Self-healing links: a peer connection that goes `failed` (or stays
  `disconnected` past a 3s grace) gets an **ICE restart** - the deterministic
  offerer re-offers with `iceRestart: true` (no glare; the other side waits on a
  5s re-check loop), both sides capped at 3 attempts before the peer is dropped
  so neither hangs in "Reconnecting" forever. The cached ICE config expires at
  90% of the TURN credential ttl and a restart applies the refreshed config to
  the live connection (`pc.setConfiguration`), so it never rides a dead
  credential.
- Quality indicator: a 2s `getStats()` poll per link -> `extractQualityInputs`
  (RTT + fractionLost from remote-inbound-rtp, jitter from inbound-rtp) ->
  `qualityOf`/`worstQuality` (pure, tested). The call bar shows an amber/red
  wifi icon on fair/poor and a "Reconnecting…" chip while a previously-connected
  peer is down. There is no long "buffered replay" - the browser's jitter buffer
  (NetEq) already does short-gap buffering with accelerated catch-up; anything
  longer would put a live conversation seconds behind.

### ICE / TURN

The browser fetches `GET /api/voice/ice-servers` for STUN (always) plus TURN when
[self-hosted coturn](../architecture/webrtc.md) is configured, with an ephemeral
per-request credential. Without TURN the app is STUN-only and a call behind
symmetric NAT will fail (the UI surfaces the failure).

### Persistence (the call log)

`voice_call` now records full lifecycles, not just misses: a league room opens an
ONGOING row on first join, a DM once both parties connect (an unanswered ring
stays the missed-call path); participants accumulate in `participantIds` and the
row closes ENDED (with `endedAt`) when the room empties. The roomKey->row map is
in-process (`callLogByRoom` in `live/voice.ts`), same lifetime as the rooms.
`GET /api/voice/calls` serves a scope's recent rows (authz = `resolveVoiceScope`);
the chat composables fetch it and `ChatPanel.vue` interleaves the lines into the
timeline by `startedAt`. The `VOICE_MISSED` notification carries caller + room
context (no media), deep-linking to the DM thread or league room.

## Scope / limits

- Single-instance, like the rest of the hub: rooms are per-node, so calls would not
  span a multi-node deploy (tracked in [../../TODO.md](../../TODO.md)).
- Mesh scales to a handful of participants; large league rooms would need an SFU
  (deferred, TODO).
- Deferred to TODO: signing the SDP fingerprint to close a server-side SDP MITM
  (passive listening is already blocked by SRTP), ICE-restart to survive a socket
  flap mid-call, a presence snapshot on chat open (the badge is live from the
  next join/leave), video. A server restart mid-call orphans the ONGOING call-log
  row (accepted: same in-process lifetime as the rooms).

## Sources

- Server: `apps/web-nuxt/server/utils/voice/service.ts`, `apps/web-nuxt/server/utils/live/voice.ts`,
  `apps/web-nuxt/server/utils/live/voice-rooms.ts`, `apps/web-nuxt/server/utils/live/hub.ts` (voice
  primitives), `apps/web-nuxt/server/routes/_ws.ts`, `apps/web-nuxt/server/api/voice/ice-servers.get.ts`,
  `apps/web-nuxt/server/api/voice/calls.get.ts`
- Client: `apps/web-nuxt/app/composables/useVoiceCall.ts`, `apps/web-nuxt/app/utils/voice.ts`,
  `apps/web-nuxt/app/components/VoiceCallButton.vue`, `VoiceCallOverlay.client.vue`,
  `VoiceAudio.vue`
- Shared: `apps/web-nuxt/shared/types/voice.ts` (scope, room key, frames, ICE response)
- Schema: `voice_call` + `voice_call_status` enum; `VOICE_MISSED` notification;
  `pushCalls` category (`apps/web-nuxt/db/app-schema.ts`, `apps/web-nuxt/db/auth-schema.ts`)
- Infra: `coturn` service in `apps/web-nuxt/compose.yaml` (the `voice` profile)
- E2E: `apps/web-nuxt/tests/e2e/voice-chat.e2e.ts`
