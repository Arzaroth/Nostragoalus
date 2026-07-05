# Build integrity (client-code fingerprint)

Chat and DMs are end-to-end encrypted **in the browser** (`app/utils/e2ee.ts`,
libsodium), so their security depends on the JavaScript the server delivers.
This subsystem makes a *silent swap* of that client code **detectable** (not
prevented - it is server-delivered code).

## Mechanism

- `lib/integrity/digest.mjs` - pure, dependency-free helper. `sha256Hex`,
  `bundleDigest` (SHA-256 over the sorted `name<space>sha256` lines of every
  chunk, so it is order-independent and content-addressed), `formatDigest`
  (octet grouping for eyeballing). Plain ESM so the build task imports it under
  node with no compile step; unit-tested in `lib/integrity/digest.test.ts` (runs
  in the `unit` vitest project; `lib/` is outside the coverage `include` globs).
- `mise-tasks/build-integrity` - runs post-`nuxt build` (wired as the
  `postbuild` npm script; also `mise run build-integrity`). Walks the
  content-hashed client chunks under `.output/public/_nuxt/*.js`, SHA-256s each,
  computes the bundle digest, and writes `.output/public/build-integrity.json`
  (`{ version, algorithm, digest, chunkCount, generatedAt }`), served statically
  at `/build-integrity.json`. Tolerant of a missing build dir (warns, exits 0).
- `app/pages/about.vue` - fetches `/build-integrity.json` client-side (tolerant
  of 404 on a dev server) and shows the build version + grouped digest under a
  "Client-code integrity" card. i18n keys `about.integrity*` in all five locales.

## What it guarantees

- **Deterministic + reproducible**: identical source + toolchain -> identical
  digest (Vite chunk filenames are content hashes). `generatedAt`/`chunkCount`
  are metadata; only `digest` + `version` + `algorithm` are the comparison
  values.
- **Detectability**: an operator publishes the digest of an honest build; if a
  later build swaps the crypto code, the served digest diverges and a comparison
  (self-computed or against the published value) catches it.

## What it does NOT guarantee

- It does **not** prevent a compelled operator from shipping malicious JS on
  first load - the same server can also fake `/build-integrity.json`. Real
  assurance needs a third party to reproduce the build / hash the delivered
  chunks out-of-band. See `TODO.md` "Client-code integrity".
- Real Subresource Integrity (`integrity=` on the app's own chunks) is not
  cleanly feasible: Nuxt/Vite load code-split chunks via dynamic `import()` /
  `modulepreload` with no integrity attribute. Deliberately skipped (same
  reasoning as the deferred script-src CSP in `nuxt.config.ts`).

Related: [../features/](../features/index.md) chat/E2EE, `app/utils/e2ee.ts`
(the `fingerprint` safety-number is the analogous idea for public keys).
