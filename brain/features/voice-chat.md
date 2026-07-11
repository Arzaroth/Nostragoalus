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
  category). While connected, an in-call bar (mute, hang-up, a timer) floats above
  the chat dock.
- **League:** a Join-voice button in the league chat header, carrying a live
  "N in voice" badge so members see a call is happening without being in it.
  Inside the call, an Invite control rings chosen members. The room is ephemeral -
  it exists while at least one person is in it.
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
`server/routes/_ws.ts`; the logic lives in `server/utils/live/voice.ts` (under the
coverage gate), with the send primitives in `server/utils/live/hub.ts`:

- `voice:join` / `voice:leave` - enter/leave the call for a scope. The server
  authorizes the scope (`server/utils/voice/service.ts` `resolveVoiceScope`,
  reusing DM-participant + league-member checks), seats the socket in the room
  (`server/utils/live/voice-rooms.ts`) and fans the roster to the room.
- `voice:signal` - relays one SDP offer/answer or ICE candidate to another
  participant. Authorized purely by live room membership (both peers must be in the
  same room), so there is no per-signal DB hit and no way to push signaling at a
  user who is not in the call.
- `voice:invite` - rings members; an offline target is recorded as a missed call
  immediately. `voice:decline` / `voice:cancel` - clear the other side's UI;
  cancel of an unanswered ring records the miss.
- `voice:roster` (participants) and `voice:presence` (a league room's count to
  every league member, for the badge) go back out.

**One endpoint per user per room:** `voice-rooms.ts` keeps a single socket per user
in a room, so a second tab joining takes the call over (the old tab is evicted) -
one mic per person, and signaling targets the one participating tab.

### The mesh (client)

`app/composables/useVoiceCall.ts` is an app-wide singleton (one per tab, like
[`usePresence`](../architecture/realtime.md)) owning a dedicated signaling socket
and the peer-connection map. The glare-free offerer rule and roster diff are pure
and unit-tested in `app/utils/voice.ts`:

- On a `voice:roster` frame it diffs the peer set (`rosterDelta`) and, for each new
  peer, the lexicographically smaller id offers (`shouldOffer`) while the other
  waits - so exactly one side of each pair offers, and late joiners connect the
  same way (no glare, no full perfect-negotiation needed for audio-only).
- Mic via `getUserMedia` (a denial surfaces an error toast); remote streams are
  keyed by peer for the hidden `<audio>` elements (`VoiceAudio.vue`). Mute toggles
  the local track. On a socket reconnect it re-joins so the room heals.

### ICE / TURN

The browser fetches `GET /api/voice/ice-servers` for STUN (always) plus TURN when
[self-hosted coturn](../architecture/webrtc.md) is configured, with an ephemeral
per-request credential. Without TURN the app is STUN-only and a call behind
symmetric NAT will fail (the UI surfaces the failure).

### Persistence

Deliberately thin. `voice_call` records only a **missed** call (for the
notification + future call history); the live call's roster and signaling are
purely in-process. The `VOICE_MISSED` notification carries caller + room context
(no media), deep-linking to the DM thread or league room.

## Scope / limits

- Single-instance, like the rest of the hub: rooms are per-node, so calls would not
  span a multi-node deploy (tracked in [../../TODO.md](../../TODO.md)).
- Mesh scales to a handful of participants; large league rooms would need an SFU
  (deferred, TODO).
- Deferred to TODO: signing the SDP fingerprint to close a server-side SDP MITM
  (passive listening is already blocked by SRTP), ICE-restart to survive a socket
  flap mid-call, live speaking indicators, a presence snapshot on chat open (the
  badge is live from the next join/leave), video.

## Sources

- Server: `server/utils/voice/service.ts`, `server/utils/live/voice.ts`,
  `server/utils/live/voice-rooms.ts`, `server/utils/live/hub.ts` (voice
  primitives), `server/routes/_ws.ts`, `server/api/voice/ice-servers.get.ts`
- Client: `app/composables/useVoiceCall.ts`, `app/utils/voice.ts`,
  `app/components/VoiceCallButton.vue`, `VoiceCallOverlay.client.vue`,
  `VoiceAudio.vue`
- Shared: `shared/types/voice.ts` (scope, room key, frames, ICE response)
- Schema: `voice_call` + `voice_call_status` enum; `VOICE_MISSED` notification;
  `pushCalls` category (`db/app-schema.ts`, `db/auth-schema.ts`)
- Infra: `coturn` service in `compose.yaml` (the `voice` profile)
- E2E: `tests/e2e/voice-chat.e2e.ts`
