import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import type { StorageDriver } from '../driver'
import { StorageError } from '../../errors'
import { contentTypeFromKey } from '../keys'

export interface FsDriverOptions {
  root: string
}

// Filesystem driver: one file per key under a configured root. Writes are atomic
// (temp file + rename) so a concurrent reader or a live backup tar never captures a
// half-written object.
export function fsDriver(options: FsDriverOptions): StorageDriver {
  const root = resolve(options.root)

  function pathFor(key: string): string {
    const full = resolve(join(root, key))
    if (full !== root && !full.startsWith(root + sep)) {
      throw new StorageError(`storage key escapes root: ${key}`)
    }
    return full
  }

  return {
    async put(key, bytes) {
      const full = pathFor(key)
      const tmp = `${full}.${randomUUID()}.tmp`
      try {
        await mkdir(dirname(full), { recursive: true })
        await writeFile(tmp, bytes)
        await rename(tmp, full)
      } catch (err) {
        await unlink(tmp).catch(() => {})
        throw new StorageError(`fs put ${key} failed: ${(err as Error).message}`)
      }
    },
    async get(key) {
      const full = pathFor(key)
      try {
        const buf = await readFile(full)
        return { bytes: new Uint8Array(buf), contentType: contentTypeFromKey(key) }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new StorageError(`fs get ${key} failed: ${(err as Error).message}`)
      }
    },
    async delete(key) {
      try {
        await unlink(pathFor(key))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
        throw new StorageError(`fs delete ${key} failed: ${(err as Error).message}`)
      }
    },
    async exists(key) {
      try {
        await access(pathFor(key))
        return true
      } catch {
        return false
      }
    },
  }
}
