# syntax=docker/dockerfile:1
ARG NODE_VERSION=22

# Debian slim over alpine: cycletls ships a glibc-linked Go uTLS helper (Sofascore
# odds + line-ups, and chat link unfurls go through it). slim has real glibc +
# libstdc++, so the helper runs native instead of through the musl gcompat shim.
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Fetch dependencies into the pnpm store (cached on lockfile changes only).
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

# Full install with sources (shared by the dev and build targets).
FROM deps AS install
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline

# Dev target: hot-reloading dev server (used by the compose `dev` profile).
FROM install AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "-C", "apps/web-nuxt", "dev", "--host"]

# Build the production output.
FROM install AS build
ARG TARGETARCH
ENV NODE_ENV=production
RUN pnpm -C apps/web-nuxt build
# cycletls ships a Go helper for every OS/arch (linux x64 -> `index`, linux arm64 ->
# `index-arm64`, plus mac/freebsd/windows). The runtime only execs this image's; drop
# the rest so it carries one ~18MB binary, not the whole zoo.
RUN cd apps/web-nuxt/node_modules/cycletls/dist \
  && case "$TARGETARCH" in arm64) keep=index-arm64 ;; *) keep=index ;; esac \
  && find . -maxdepth 1 -type f -name 'index*' ! -name "$keep" ! -name 'index.js' ! -name 'index.d.ts' -delete

# Minimal production runtime on slim: real glibc AND a shell, which cycletls' Go
# uTLS helper needs (it spawns via `/bin/sh -c`, absent on distroless). Runs as the
# node image's built-in non-root `node` user (uid 1000).
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app/apps/web-nuxt/.output ./.output
# Nitro traces cycletls' JS but not its spawned Go helper binary; add this arch's
# build (pruned to one in the build stage) so the uTLS engine can start.
COPY --from=build /app/apps/web-nuxt/node_modules/cycletls/dist/index* ./.output/server/node_modules/cycletls/dist/
COPY --from=build /app/apps/web-nuxt/drizzle ./drizzle
USER node
EXPOSE 3000
# slim has no wget/curl; node's global fetch (node is on PATH here) is the liveness probe.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
