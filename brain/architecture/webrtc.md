# WebRTC (voice)

How voice calls connect. The feature and UX: [../features/voice-chat.md](../features/voice-chat.md).
The signaling transport: [realtime.md](realtime.md). Grep keywords: webrtc, coturn,
turn, stun, ice, srtp, mesh, RTCPeerConnection, ice-servers.

## Topology: a mesh, peer-to-peer

Every pair of participants holds one `RTCPeerConnection` carrying DTLS-SRTP audio.
The server relays only signaling; it never sees or forwards media. Consequences:

- **E2EE by construction** - media is encrypted end-to-end between the two
  browsers, matching the E2EE chat's stance. This is the reason we do NOT use an
  SFU (a media server would terminate/relay the streams, breaking that). See
  [../decisions.md](../decisions.md).
- **Scales to a handful.** A room of N is `N*(N-1)/2` connections; fine for a DM
  (one connection) and small league rooms, degrading beyond ~5-6. A large room
  would need an SFU (deferred, [../../TODO.md](../../TODO.md)).

## Signaling

There is no separate signaling server: the one in-process
[WebSocket hub](realtime.md) relays the `voice:*` frames. A socket is authenticated
once at open, so a signaling frame inherits its `userId`. Scope authorization
(who may be in a call) happens at join/invite (reusing the DM/league chat checks);
relaying a candidate is authorized by live room membership alone. See
[../features/voice-chat.md](../features/voice-chat.md) for the frame list.

## ICE: STUN + TURN

`GET /api/voice/ice-servers` returns the ICE config the browser hands to each
`RTCPeerConnection`:

- **STUN** (a public server) is always present - enough for peers on cooperative
  NATs and for two browsers on one host (loopback candidates, which is how the e2e
  connects with no TURN).
- **TURN** (a relay for peers behind symmetric NAT / strict firewalls) is added
  only when self-hosted coturn is configured. Without it the app is STUN-only and
  such calls fail to connect; the client surfaces that.

### coturn (self-hosted relay)

A `coturn` container behind the `voice` [compose](operations.md) profile
(`docker compose --profile voice up`) - the base stack is unchanged for deploys
that do not want calls. Runs in `use-auth-secret` mode: the app mints an ephemeral,
time-limited credential per request (`turnCredential` in
`server/utils/voice/service.ts` - `username = <expiry>:<userId>`,
`credential = base64(HMAC-SHA1(secret, username))`), which coturn recomputes and
accepts until expiry, so no per-user accounts are stored and the shared secret
never reaches the browser.

Runtime config (`NUXT_TURN_SECRET` / `NUXT_TURN_HOST` / `NUXT_TURN_REALM`, plus
`NUXT_TURN_EXTERNAL_IP` when not on host networking). Prod: open the coturn ports
(3478 + the relay range) in the firewall and mount a TLS cert for `turns:`. The
relay is opaque to the media - it forwards SRTP packets it cannot decrypt, so
E2EE holds even through TURN.

## Known gap

The server relays SDP, so a malicious server could swap a DTLS fingerprint and MITM
a call. Passive listening is already blocked (SRTP), but closing the active-MITM
requires signing the fingerprint with the chat identity key (needs an Ed25519 key
alongside the X25519 box key) - deferred, tracked in [../../TODO.md](../../TODO.md),
the same tiered approach as the E2EE hardening in [../decisions.md](../decisions.md).

## Sources

- `server/api/voice/ice-servers.get.ts`, `server/utils/voice/service.ts`
  (`buildIceServers`, `turnCredential`)
- `compose.yaml` (`coturn`, the `voice` profile), `.env.example` (`NUXT_TURN_*`)
- `app/composables/useVoiceCall.ts` (the peer-connection mesh)
