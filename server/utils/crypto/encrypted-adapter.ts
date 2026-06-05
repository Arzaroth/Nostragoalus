import { decryptSecret, encryptSecret, isSealed } from './envelope'

// The @better-auth/sso plugin stores provider config (incl. client secrets and
// SAML keys) as JSON in the ssoProvider.oidcConfig / .samlConfig columns. This
// wrapper envelope-encrypts those columns on write and decrypts them on read,
// transparently — every other model passes straight through untouched.

const ENCRYPTED_MODEL = 'ssoProvider'
const ENCRYPTED_FIELDS = ['oidcConfig', 'samlConfig'] as const

function sealFields<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data }
  for (const f of ENCRYPTED_FIELDS) {
    const v = out[f]
    if (typeof v === 'string' && v.length > 0) out[f] = JSON.stringify(encryptSecret(v))
  }
  return out as T
}

function openFields<T>(row: T): T {
  if (!row || typeof row !== 'object') return row
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  for (const f of ENCRYPTED_FIELDS) {
    const v = out[f]
    if (typeof v === 'string' && v.length > 0) {
      try {
        const parsed = JSON.parse(v)
        if (isSealed(parsed)) out[f] = decryptSecret(parsed)
      } catch {
        // not JSON / not a sealed envelope — leave as-is (e.g. legacy plaintext)
      }
    }
  }
  return out as T
}

type AnyAdapter = Record<string, (args: { model: string; data?: Record<string, unknown>; update?: Record<string, unknown> }) => unknown>
type AdapterFactory = (options: unknown) => AnyAdapter

export function withEncryptedSSO<F>(factory: F): F {
  return ((options: unknown) => {
    const adapter = (factory as AdapterFactory)(options)
    const isEnc = (model: string) => model === ENCRYPTED_MODEL
    return {
      ...adapter,
      async create(args) {
        if (!isEnc(args.model)) return adapter.create(args)
        return openFields(await adapter.create({ ...args, data: sealFields(args.data ?? {}) }))
      },
      async update(args) {
        if (!isEnc(args.model)) return adapter.update(args)
        const a = args.update ? { ...args, update: sealFields(args.update) } : args
        return openFields(await adapter.update(a))
      },
      async updateMany(args) {
        if (!isEnc(args.model) || !args.update) return adapter.updateMany(args)
        return adapter.updateMany({ ...args, update: sealFields(args.update) })
      },
      async findOne(args) {
        const row = await adapter.findOne(args)
        return isEnc(args.model) ? openFields(row) : row
      },
      async findMany(args) {
        const rows = await adapter.findMany(args)
        return isEnc(args.model) && Array.isArray(rows) ? rows.map(openFields) : rows
      },
    }
  }) as F
}
