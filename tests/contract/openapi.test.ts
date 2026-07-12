import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildOperation, type ContractMeta } from '../../server/utils/openapi/contract'
import { filePathToRoute } from '../../server/utils/openapi/route-path'
import type { HandlerContract } from '../../server/utils/validated-handler'

// The spec emitter + its drift gate. It stubs the h3/Nitro globals a route file
// touches at import time, imports every server/api route, reads the __contract
// each wrapper attached, and builds one OpenAPI operation per converted route
// from the SAME zod the handler validates with.
//
//   Normal run  : rebuild the spec, assert it equals the committed snapshot -
//                 a changed schema (or a newly converted route) fails here until
//                 re-blessed, exactly like `db:generate`.
//   CONTRACT_BLESS: rewrite the snapshot.  CONTRACT_BLESS=1 pnpm test:run tests/contract
const apiDir = fileURLToPath(new URL('../../server/api', import.meta.url))
const snapshotPath = fileURLToPath(new URL('./openapi.snapshot.json', import.meta.url))
const bless = !!process.env.CONTRACT_BLESS

// defineRouteMeta runs at import time; capture the prose it carries per route.
let lastMeta: Record<string, unknown> | undefined

function stubGlobals() {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('defineCachedEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('defineRouteMeta', (m: { openAPI?: Record<string, unknown> }) => {
    lastMeta = m?.openAPI
  })
  // Call-time helpers a route body may reference; harmless no-ops during import.
  for (const name of ['readBody', 'getQuery', 'getRouterParam', 'getHeader', 'createError', 'sendRedirect', 'setResponseStatus', 'getRequestHost', 'getRequestURL']) {
    vi.stubGlobal(name, () => undefined)
  }
  vi.stubGlobal('useRuntimeConfig', () => ({}))
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

function metaFrom(openAPI: Record<string, unknown> | undefined): ContractMeta {
  if (!openAPI) return {}
  const meta: ContractMeta = {}
  if (Array.isArray(openAPI.tags)) meta.tags = openAPI.tags as string[]
  if (typeof openAPI.summary === 'string') meta.summary = openAPI.summary
  if (typeof openAPI.description === 'string') meta.description = openAPI.description
  if (openAPI.responses && typeof openAPI.responses === 'object') {
    const responses: Record<string, { description: string }> = {}
    for (const [code, r] of Object.entries(openAPI.responses as Record<string, { description?: string }>)) {
      if (r?.description) responses[code] = { description: r.description }
    }
    if (Object.keys(responses).length) meta.responses = responses
  }
  return meta
}

interface Spec {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, unknown>>
}

let spec: Spec
const report = { converted: 0, unconverted: [] as string[], failed: [] as string[] }

// Routes that carry no response contract BY DESIGN: they return something other
// than a JSON body (binary, XML, HTML, an .ics feed), are not a route at all, or
// are an external catch-all. Anything NOT converted and NOT here fails the gate,
// so a new route must either opt into the contract or be listed here on purpose -
// the drift gate ratchets, it never silently skips a route. A converted route
// that starts failing to import also lands outside this set and trips the gate.
const NO_CONTRACT = [
  'admin/sso/sp-metadata.get.ts', // SAML SP metadata (application/xml)
  'auth/[...all].ts', // better-auth catch-all (not our contract)
  'feed/calendar.ics.get.ts', // calendar feed (text/calendar)
  'media/avatar/[key].get.ts', // avatar image bytes
  'media/reward/[key].get.ts', // reward image bytes
  'notifications/_schema.ts', // shared zod helper, not a route (underscore-prefixed)
  'sso/test-callback.get.ts', // SSO test result page (text/html)
].sort()

beforeAll(async () => {
  stubGlobals()
  spec = { openapi: '3.0.3', info: { title: 'Nostragoalus API', version: '1.0' }, paths: {} }
  const files = walk(apiDir).sort()
  for (const abs of files) {
    lastMeta = undefined
    let mod: { default?: HandlerContract }
    try {
      mod = await import(/* @vite-ignore */ pathToFileURL(abs).href)
    } catch {
      report.failed.push(relative(apiDir, abs))
      continue
    }
    const contract = mod.default?.__contract
    if (!contract?.response) {
      report.unconverted.push(relative(apiDir, abs))
      continue
    }
    const { path, method } = filePathToRoute(relative(apiDir, abs))
    const verb = method ?? (contract.kind === 'read' ? 'get' : 'post')
    spec.paths[path] ??= {}
    // Two files must never resolve to the same operation - last-write-wins would
    // silently drop one route's schema from the published contract.
    if (spec.paths[path][verb]) {
      throw new Error(`openapi: ${verb.toUpperCase()} ${path} emitted twice (last from ${relative(apiDir, abs)})`)
    }
    spec.paths[path][verb] = buildOperation({ body: contract.body, response: contract.response, meta: metaFrom(lastMeta) })
    report.converted++
  }
  if (bless) writeFileSync(snapshotPath, `${JSON.stringify(spec, null, 2)}\n`)
})

afterAll(() => vi.unstubAllGlobals())

describe('openapi spec emitter', () => {
  it('ratchets: every route is either contract-bound or explicitly exempt', () => {
    // The set of routes WITHOUT a contract (no response schema, or failed to
    // import) must be exactly NO_CONTRACT. A new raw-handler route, or a
    // converted route that starts failing to import, lands outside NO_CONTRACT
    // and fails here - so the contract cannot silently regress or under-cover.
    const withoutContract = [...report.unconverted, ...report.failed].sort()
    // eslint-disable-next-line no-console
    console.log(`[contract] converted=${report.converted} without-contract=${withoutContract.length}`)
    expect(withoutContract).toEqual(NO_CONTRACT)
  })

  it('emits an operation for each converted route', () => {
    expect(spec.paths['/api/stats']?.get).toBeDefined()
    expect(spec.paths['/api/predictions/joker']?.put).toBeDefined()
  })

  it('matches the committed snapshot (regen-clean, like db:generate)', () => {
    const committed = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    expect(spec).toEqual(committed)
  })
})
