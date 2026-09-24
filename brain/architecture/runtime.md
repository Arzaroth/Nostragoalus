# Runtime (the deployed process and its limits)

How the app actually runs in production, and the operational facts that are not
visible from the source alone. The stack itself is defined in
`apps/web-nuxt/compose.yaml`; the deploy commands live in `.mise.toml`
(`mise run deploy` for prod, `mise run up` for the local prod-like stack).

## Topology

- `app` - the Nuxt/Nitro server. One container, one process: **all the live
  state is in-process** (the WS hub, presence, viewer rooms, voice rooms, the
  route-level caches), which is why the deploy is single-instance. See
  [realtime.md](realtime.md) for what that state is.
- `db` - Postgres 17. No published port: the app reaches it in-network.
- `rustfs` (+ a one-shot `rustfs-init` to make the bucket) - S3-compatible blob
  storage for avatars and chat images. See [storage.md](storage.md).
- `coturn` - TURN for peer-to-peer voice, behind the `voice` profile (both
  `mise run up` and `mise run deploy` pass `--profile voice`). See
  [webrtc.md](webrtc.md).
- `mc` - an ephemeral MinIO client behind the `tools` profile, never started
  normally; `mise run db-backup` / `db-restore` `docker compose run` it.

The app bind-mounts `./downloads` read-only at `/data/downloads` for the
published Android build's sidecar (the APK itself lives in R2, see
[../features/mobile-app.md](../features/mobile-app.md)), and sets
`ulimits: core: 0`: a hard crash once dumped a multi-GB core into the writable
layer, filled the docker disk and took Postgres down.

The app publishes on loopback only (`127.0.0.1:${NG_APP_PORT:-3000}:3000`) and a
reverse proxy in front terminates TLS. `NG_APP_PORT` exists so a host whose 3000
is taken sets it in `.env` instead of carrying a local edit to a committed file.

Prod runs the **Bun** target: `NG_RUNTIME=bun mise run deploy` exports
`NG_APP_TARGET=prod-bun` + `NG_APP_TAG_SUFFIX=-bun`, so the image is
`nostragoalus-app:<x.y.z>-bun`. The Node target (`prod`) is the default and still
builds. Both run the same build output, only the runtime base differs
(`apps/web-nuxt/Dockerfile`, each with its own `HEALTHCHECK` fetching `/` every
30 s).

## Memory

`mem_limit: 2g` on the `app` service, against a steady-state RSS of ~350 MB.

The cap is a **failure-mode converter, not a tuning knob**. On 2026-07-21 the
process leaked to a 6.2 GB heap over ~24 h. At that size JavaScriptCore's GC
never finished a cycle: seven `HeapHelper` threads burned ~2 h of CPU each, one
core stayed pegged, and every request took 30 s. The container never crashed, so
`restart: unless-stopped` never fired; it just sat there `up`, failing its
`HEALTHCHECK` 279 times in a row while the origin 502'd for hours.

**Docker does not restart an unhealthy container** - only a dead one. A cgroup
limit is what turns "wedged forever" into an OOM kill plus a ~10 s restart. The
leak itself is still unfound (tracked in `TODO.md`).

## Diagnosing memory

`GET /api/admin/heap` (admin only, `apps/web-nuxt/server/api/admin/heap.get.ts`) returns the
live `process.memoryUsage()` counters plus uptime. With `?snapshot=1` it writes a
full heap snapshot inside the container and returns its path and size.

- The snapshot is written to `/tmp/heap-<epoch-ms>.json` and **never returned over the wire** - it
  contains every live string in the process (sessions, decrypted chat, provider
  payloads). Pull it with `docker cp`, read it in a devtools/Safari heap viewer,
  delete it after.
- Take it while the heap is *elevated but under the cap*. Once RSS approaches
  2 GB the OOM kill destroys the evidence, and generating a snapshot itself
  allocates.
- The route imports `bun:jsc` through a runtime-assembled specifier so the Node
  build does not try to resolve it, and falls back to `node:v8`'s
  `writeHeapSnapshot` off the Bun target.

## Related

- [server.md](server.md) - routes, services, the task registry.
- [realtime.md](realtime.md) - the in-process state that makes this single-instance.
- [testing.md](testing.md) - the merge gate that runs before any of this ships.

## Sources

- `apps/web-nuxt/compose.yaml` (services, profiles, `mem_limit`, `ulimits`, ports)
- `apps/web-nuxt/Dockerfile` (`prod` / `prod-bun` targets, `HEALTHCHECK`)
- `.mise.toml` (`up`, `deploy`, `NG_RUNTIME`)
- `apps/web-nuxt/server/api/admin/heap.get.ts`
- `TODO.md` "Prod app heap leak"
