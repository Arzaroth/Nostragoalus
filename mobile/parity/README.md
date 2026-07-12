# Nostragoalus mobile parity

Cross-stack guardrails for a future Flutter/Dart client, so it cannot silently
diverge from the web app. Two independent pieces, both fed by artifacts the TS
side already produces and commits:

1. **Vector runner** - replays the golden vectors frozen under
   `tests/parity/vectors/*.json` against Dart reimplementations of the pure,
   security-critical logic. The frozen `expected` is the contract both stacks
   must hit; a mismatch is a real divergence.
2. **Model codegen** - generates Dart request/response classes from the
   zod-derived OpenAPI snapshot (`tests/contract/openapi.snapshot.json`), so the
   wire contract is single-sourced from the server's zod schemas.

See `../../brain/architecture/cross-stack-contract.md` for the whole design.

> Heads-up: this package was authored alongside the TS side but **not executed**
> in that environment (no Dart SDK there). Treat the first `dart test` run as the
> real validation; any typo here surfaces immediately against the vectors.

## Layout

```
lib/
  commitment.dart        port of shared/commitment.ts        (implemented)
  key_transparency.dart  port of shared/key-transparency.ts  (implemented)
  match_logic.dart       port of shared/types/match.ts        (implemented)
  dispatch.dart          name -> Dart fn registry (mirrors tests/parity/dispatch.ts)
  harness.dart           vector loader + JSON deep-equality
tool/gen_models.sh       OpenAPI -> Dart model codegen
test/parity_test.dart    loads every vector file and replays it
```

## Run the vector parity

```sh
cd mobile/parity
dart pub get
dart test
```

Implemented modules (`commitment`, `key-transparency`, `match`) run against
their vectors. The rest are **skipped, loudly** until ported - see
`notYetImplemented` in `dispatch.dart`, which lists exactly what each needs:

- `e2ee` - needs a libsodium binding (`sodium_libs` for Flutter, or `sodium`
  ffi for pure Dart). Its vectors carry `Uint8Array` args/results tagged
  `{ "$b64": "..." }`; add a `revive`/`encode` step in `harness.dart` that
  base64-decodes a tagged arg before the call and re-tags a bytes result (the TS
  `dispatch.ts` does the same). Then port `app/utils/e2ee.ts` - the vectors only
  exercise the deterministic decrypt/unseal/derive direction, which is all a
  client needs to interoperate.
- `scoring`, `fergie`, `standings`, `consensus` - pure arithmetic/logic, port
  from the paths listed in `dispatch.dart`. No new deps.

Porting one module = implement it in `lib/`, add its entries to the `registry`
and remove it from `notYetImplemented`. The vectors do the rest.

## Regenerate API models

```sh
cd mobile/parity
sh tool/gen_models.sh   # needs openapi-generator-cli + a JDK
```

The input snapshot only covers routes converted so far; it grows as the
response-schema fan-out finishes (`admin/` and `leagues/` still pending on the
TS side). Re-freeze it with `CONTRACT_BLESS=1 pnpm test:run tests/contract`
before regenerating.
