# E2EE trust model

What the end-to-end encryption on chat and DMs actually protects against, and what
it does not. Read this before repeating the "no one, not even the site owner, can
read it" line - that holds against a **passive** server, not an actively malicious
one, and the wording matters.

## The crypto (recap)

Each user's browser generates a libsodium keypair (`app/utils/e2ee.ts`
`generateIdentity`) and uploads only the public key (`registerChatIdentity`). A
random per-league group key is sealed to each member's public key (anonymous
sealed box); messages are `crypto_secretbox` (XSalsa20-Poly1305) under the group
key. The private key never leaves the device (escrowed only under
Argon2id(recovery code); the code is never sent to the server -
`useChatIdentity.ts` posts the wrapped blob only). So **data at rest is genuinely
unreadable by the server**: a "hand over the chats" order yields ciphertext.

## The boundary

The residual risk is a **compelled or compromised server acting forward in time**.
Two vectors:

1. **Key substitution.** The server is the sole distributor of every member's
   public key. If it serves an attacker's key in place of a member's, a keyholder's
   client seals the group key to the attacker -> MITM. Mitigated by
   **key transparency** (below) + out-of-band safety-number verification
   (`fingerprint`, `useChatKeyVerification`).
2. **Client-code delivery.** The server ships the crypto JS on every load, so it
   can serve code that exfiltrates plaintext. This is the hard ceiling for any
   server-served web app - it cannot be *prevented*, only made *detectable*
   (**build integrity**, below). Genuine prevention needs the client outside the
   operator's unilateral control (a store-distributed extension/app) - not built.

Honest one-liner: *E2EE protects your messages against passive access / an
honest-but-curious operator; it does not protect against a fully-compromised server,
though key-substitution and code-swaps are made detectable.*

## Hardening layers

- **Key transparency (KT)** - `shared/key-transparency.ts`,
  `server/utils/key-transparency/service.ts`, `/api/keys/{head,log}`,
  `app/composables/useKeyTransparency.ts`. An append-only, hash-chained log of every
  `(userId -> publicKey)` binding, appended when a chat identity is first created
  (serialized by a FOR UPDATE head lock, same construction as the commitment
  ledger). The whole log is public. A client recomputes the chain, pins the head
  locally, and cross-checks each served member key against the log: a `mismatch`
  (served key not the logged one) or a `logTampered` (chain fails / rewritten below
  the pinned head) surfaces in the verify dialog (`ChatPanel.vue`). **Limit
  (chosen):** in-app anchor only, no external witness - a fresh visitor with no pin
  can't catch a from-genesis rewrite; a returning client can. See
  [decisions.md](../decisions.md).
- **Forward secrecy on removal** - removing/banning a member drops their sealed
  keys and sets `league.chat_rekey_pending_at`; the server can't re-key (E2EE), so
  `getChatStatus` returns `rekeyPending` and the next OWNER/MODERATOR client
  auto-invokes `rotateKey` (fresh group key sealed to the remaining members, epoch
  bumped). Live reads were already blocked by the membership gate; this bounds a
  later ciphertext leak. `server/utils/leagues/service.ts` `removeMembership`.
- **Build integrity** - see [build-integrity.md](build-integrity.md): a published
  SHA-256 of the client bundle so a later crypto-code swap is detectable.

## What is NOT claimed

No post-compromise security / ratchet (a leaked group key reads everything at that
epoch until the next rotation). No protection against a first-load malicious bundle.
No external transparency witness. These are documented deliberately rather than
papered over.
