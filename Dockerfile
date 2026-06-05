# syntax=docker/dockerfile:1
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Fetch dependencies into the pnpm store (cached on lockfile changes only).
FROM base AS deps
RUN apk add --no-cache python3 make g++
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
CMD ["pnpm", "dev", "--host"]

# Build the production output.
FROM install AS build
ENV NODE_ENV=production
RUN pnpm build

# Minimal production runtime: only the Nitro output + committed migrations.
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", ".output/server/index.mjs"]
