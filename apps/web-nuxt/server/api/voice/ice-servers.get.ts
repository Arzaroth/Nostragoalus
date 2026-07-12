import { z } from 'zod'
import { defineReadHandler } from '../../utils/read-handler'
import { buildIceServers } from '../../utils/voice/service'

const responseSchema = z.object({
  iceServers: z.array(
    z.object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
  ttl: z.number(),
})

// The ICE servers a voice call uses to connect: a public STUN server always, plus
// self-hosted TURN when coturn is configured (with a fresh, time-limited credential
// minted per request from the shared secret - the secret itself never leaves the
// server). The client refetches before the credential's ttl lapses.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
  const cfg = useRuntimeConfig()
  return buildIceServers(
    {
      secret: cfg.turnSecret,
      host: cfg.turnHost,
      realm: cfg.turnRealm,
      port: Number(cfg.turnPort) || 3478,
      tlsPort: Number(cfg.turnTlsPort) || 5349,
    },
    user.id,
    Date.now(),
  )
})

defineRouteMeta({
  openAPI: {
    tags: ['Voice'],
    summary: 'ICE servers for a voice call',
    description:
      'STUN (always) and TURN (when coturn is configured) with an ephemeral credential. Used to set up the WebRTC peer connection for DM and league voice calls.',
    responses: { '200': { description: '{ iceServers: [...], ttl }.' } },
  },
})
