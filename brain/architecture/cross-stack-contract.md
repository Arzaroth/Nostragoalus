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
inline - so the full `openapi.json` is generated OUT OF BAND by a stubbed-import
walker (stub the h3/wrapper globals, import each route, capture its schemas),
NOT through the macro. The old hand-written `requestBody`/`responses` JSON-Schema
literals in `defineRouteMeta` are the copy being retired.

### Open slices (see TODO.md "Cross-stack contract & parity")
- Spec emitter: the stubbed-import walker over all routes -> committed
  `openapi.json`; a contract test that fails on staleness or a missing response
  schema (regen-clean, same discipline as `db:generate`).
- Date wire-shape policy: a handler returns a `Date` before h3 serializes it,
  but the wire/Dart contract wants an ISO string. Decide once (schema describes
  the wire shape + validate post-serialize, or `z.date()` + a mapper) before
  fanning out to the routes that return dates.
- Fan-out: response schema on the remaining routes, by feature area.

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

First module: `commitment` (the commit-reveal ledger,
[../features](../features/index.md) tamper-evidence). Queued: `key-transparency`,
`e2ee` crypto (libsodium KATs), `scoring`, `criteria`, `fergie`, `achievements`,
`match`/`stage`.

Related: [e2ee-trust-model.md](e2ee-trust-model.md),
[build-integrity.md](build-integrity.md), [testing.md](testing.md).
