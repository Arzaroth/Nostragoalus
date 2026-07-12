# Cross-stack contract & logic parity

Two build-time disciplines that let a non-TS client (a planned Flutter/Dart
mobile app) stay bit-for-bit consistent with the server without sharing code.
Both are pure wins on their own - they harden the web app today - and neither is
lost if the mobile app never ships. Back to the map: [../BRAIN.md](../BRAIN.md).

## Why

The web app is Nuxt/Vue: no UI reuse crosses to Dart, so parity means a rebuild
either way. What is worth protecting is the logic that must agree exactly across
stacks: the request/response wire contract, and the security-critical pure
functions (commit-reveal ledger, key transparency, crypto). These two subsystems
make that agreement machine-checkable instead of hoped-for.

## Contract: one zod source per route

Each route validates with a zod schema; the OpenAPI doc (and, downstream, a
generated Dart client) is built from that SAME schema, so the published contract
can never drift from what the server accepts and returns.

- [server/utils/openapi/contract.ts](../../server/utils/openapi/contract.ts) -
  `toOpenApiSchema` (zod -> OpenAPI 3.0 via `z.toJSONSchema`, with input/output
  projection) and `buildOperation` (assemble one operation from body + response
  + prose). Pure, no route/filesystem awareness.
- [validated-handler.ts](../../server/utils/validated-handler.ts) - the mutation
  wrapper gained an optional `response` schema, parsed on the way out via
  `parseResponse`. A return that breaks its contract is a loud 500, never a
  malformed 200 the client has to guess at.
- [read-handler.ts](../../server/utils/read-handler.ts) - `defineReadHandler`,
  the read counterpart: optional user/admin auth, zod query validation, and the
  same response contract. Brings the read routes under the mutations' discipline.

`defineRouteMeta` is a static Nuxt macro - it cannot call `buildOperation()`
inline - so the full `openapi.json` is generated OUT OF BAND. Each wrapper
attaches an inert `__contract` (body + response + kind) to the handler it
returns; the emitter
([tests/contract/openapi.test.ts](../../tests/contract/openapi.test.ts)) stubs
the h3/Nitro globals, imports every `server/api` route, reads that `__contract`,
and builds one operation per route via `buildOperation` +
[route-path.ts](../../server/utils/openapi/route-path.ts) (Nitro filename ->
`{ path, method }`). Normal run asserts the rebuilt spec equals the committed
`openapi.snapshot.json` (drift gate, like `db:generate`); `CONTRACT_BLESS=1`
re-freezes. A converted route that fails to import is a hard error; unconverted
ones are tolerated + counted. The hand-written `requestBody`/`responses`
literals in `defineRouteMeta` are now redundant for converted routes (retired
during fan-out).

Date policy (b, shipped): a response schema uses `z.date()` - it validates the
Date the handler returns, cheaply, in every env; `toOpenApiSchema` maps
`z.date()` to a date-time string for the wire/Dart contract, so the runtime
check and the published contract agree with no serialize dance.

### Open slices (see TODO.md "Cross-stack contract & parity")
- Fan-out: response schema on the remaining routes, by feature area. ~180
  unconverted; 8 currently fail to import under the bare unit env (aliases /
  runtime-only imports) and must be made import-clean as they are converted.

## Logic parity: frozen golden vectors

The security-critical pure logic is locked by language-agnostic JSON vectors
(`{ module, fn, args, expected }`), generated from the real TS impl and committed.
The TS suite replays them as a drift alarm; the same file is the target a Dart
reimplementation must satisfy. Test CODE cannot cross TS/Dart, but test VECTORS
can.

- [tests/parity/dispatch.ts](../../tests/parity/dispatch.ts) - name -> pure-
  function registry, so a vector replays with no reference to the impl.
- [tests/parity/cases/](../../tests/parity/cases/) - bless-time input builders
  (may call the impl to manufacture concrete, self-contained args).
- `*.parity.test.ts` - normal run replays + asserts; `pnpm parity:bless`
  (`PARITY_BLESS=1`) re-freezes after a deliberate semantics change.

Suite factored into
[tests/parity/harness.ts](../../tests/parity/harness.ts) (`parityVectors`);
`dispatch.ts` marshals `Uint8Array` args/results as `{ $b64 }` so crypto vectors
cross the JSON boundary. Modules done: `commitment` (commit-reveal ledger),
`key-transparency` (chat-key hash chain), `e2ee` (libsodium interop KATs -
decrypt/unseal/derive direction, since encrypt/seal is random). Queued:
`scoring`, `criteria`, `fergie`, `achievements`, `match`/`stage`.

Related: [e2ee-trust-model.md](e2ee-trust-model.md),
[build-integrity.md](build-integrity.md), [testing.md](testing.md).
