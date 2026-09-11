import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ANDROID_DOWNLOAD_PATH,
  APK_FILENAME,
  APK_SIDECAR_FILENAME,
  apkPath,
  clearAndroidBuildCache,
  downloadFilename,
  readAndroidBuild,
  sha256File,
} from './service'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ng-apk-'))
  clearAndroidBuildCache()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const write = (bytes: string) => writeFile(apkPath(dir), bytes)
const sidecar = (body: string) => writeFile(join(dir, APK_SIDECAR_FILENAME), body)

describe('readAndroidBuild', () => {
  it('reports no build when the directory does not exist', async () => {
    const build = await readAndroidBuild(join(dir, 'nope'))
    expect(build.available).toBe(false)
    expect(build.sha256).toBeNull()
    expect(build.sizeBytes).toBeNull()
  })

  it('reports no build when the APK is missing', async () => {
    await sidecar(JSON.stringify({ version: '9.9.9' }))
    expect((await readAndroidBuild(dir)).available).toBe(false)
  })

  it('reports no build for a zero-byte placeholder', async () => {
    await write('')
    expect((await readAndroidBuild(dir)).available).toBe(false)
  })

  it('reports no build when a directory sits at the APK path', async () => {
    await mkdir(apkPath(dir))
    expect((await readAndroidBuild(dir)).available).toBe(false)
  })

  it('describes a published APK with its size and digest', async () => {
    await write('fake-apk-bytes')
    const build = await readAndroidBuild(dir)
    expect(build.available).toBe(true)
    expect(build.sizeBytes).toBe('fake-apk-bytes'.length)
    expect(build.sha256).toBe(createHash('sha256').update('fake-apk-bytes').digest('hex'))
    // No sidecar: unknown version, and the file's own mtime as the build time.
    expect(build.version).toBeNull()
    expect(Date.parse(build.builtAt!)).not.toBeNaN()
  })

  it('takes the version and build time from the sidecar', async () => {
    await write('fake-apk-bytes')
    await sidecar(JSON.stringify({ version: '4.7.0', builtAt: '2026-09-06T10:00:00.000Z' }))
    const build = await readAndroidBuild(dir)
    expect(build.version).toBe('4.7.0')
    expect(build.builtAt).toBe('2026-09-06T10:00:00.000Z')
  })

  it('falls back to the file mtime when the sidecar omits fields', async () => {
    await write('fake-apk-bytes')
    await sidecar(JSON.stringify({ version: '', builtAt: 42 }))
    const build = await readAndroidBuild(dir)
    expect(build.version).toBeNull()
    expect(Date.parse(build.builtAt!)).not.toBeNaN()
  })

  it('still serves the download when the sidecar is malformed', async () => {
    await write('fake-apk-bytes')
    await sidecar('{ not json')
    const build = await readAndroidBuild(dir)
    expect(build.available).toBe(true)
    expect(build.version).toBeNull()
  })

  it('reuses the cached digest for an unchanged file', async () => {
    await write('fake-apk-bytes')
    const first = await readAndroidBuild(dir)
    const second = await readAndroidBuild(dir)
    expect(second.sha256).toBe(first.sha256)
  })

  it('hashes once for a burst of concurrent cold-cache reads', async () => {
    await write('fake-apk-bytes')
    const [a, b, c] = await Promise.all([
      readAndroidBuild(dir),
      readAndroidBuild(dir),
      readAndroidBuild(dir),
    ])
    expect(a.sha256).toBe(createHash('sha256').update('fake-apk-bytes').digest('hex'))
    expect(b.sha256).toBe(a.sha256)
    expect(c.sha256).toBe(a.sha256)
  })

  it('re-hashes once a new build replaces the file', async () => {
    await write('build-one')
    const first = await readAndroidBuild(dir)
    await write('build-two!')
    // Same-second writes can land on an identical mtime; move it so the change is
    // visible the way a real publish (minutes later) would be.
    const later = new Date(Date.now() + 60_000)
    await utimes(apkPath(dir), later, later)
    const second = await readAndroidBuild(dir)
    expect(second.sha256).not.toBe(first.sha256)
    expect(second.sha256).toBe(createHash('sha256').update('build-two!').digest('hex'))
  })
})

describe('sha256File', () => {
  it('digests a file the same way node does in one shot', async () => {
    await write('some bytes')
    expect(await sha256File(apkPath(dir))).toBe(createHash('sha256').update('some bytes').digest('hex'))
  })
})

describe('downloadFilename', () => {
  it('stamps the version into the saved name', () => {
    expect(downloadFilename('4.7.0')).toBe('nostragoalus-4.7.0.apk')
  })

  it('falls back to the plain name when the version is unknown', () => {
    expect(downloadFilename(null)).toBe(APK_FILENAME)
  })

  it('strips anything that would break out of the content-disposition header', () => {
    expect(downloadFilename('1.0"; x=../../etc/passwd')).toBe('nostragoalus-1.0x....etcpasswd.apk')
  })

  it('falls back when sanitizing leaves nothing', () => {
    expect(downloadFilename('"""')).toBe(APK_FILENAME)
  })
})

describe('paths', () => {
  it('names the APK inside the configured directory', () => {
    expect(apkPath('/data/downloads')).toBe('/data/downloads/nostragoalus.apk')
  })

  it('serves it from the shared download path', () => {
    expect(ANDROID_DOWNLOAD_PATH).toBe('/download/nostragoalus.apk')
  })
})

// Once the APK is published to the bucket the host only holds the sidecar, so
// the sidecar has to carry the facts the file used to supply.
describe('a build published off the origin', () => {
  const REMOTE = 'https://r2.goal.arzaroth.com/apk/nostragoalus-9.9.9.apk'
  const full = {
    version: '9.9.9',
    builtAt: '2026-09-07T23:00:03Z',
    sizeBytes: 94098184,
    sha256: 'a'.repeat(64),
    url: REMOTE,
  }

  it('is available from the sidecar alone, with no file on disk', async () => {
    await sidecar(JSON.stringify(full))
    const build = await readAndroidBuild(dir)
    expect(build).toMatchObject({
      available: true,
      version: '9.9.9',
      sizeBytes: 94098184,
      sha256: 'a'.repeat(64),
      remoteUrl: REMOTE,
    })
  })

  // The page states a size and a digest and asks people to check the digest, so
  // a sidecar that cannot state them describes nothing worth publishing.
  it('is not published when the sidecar is missing a fact', async () => {
    for (const missing of ['sizeBytes', 'sha256', 'url'] as const) {
      const partial: Record<string, unknown> = { ...full }
      delete partial[missing]
      await sidecar(JSON.stringify(partial))
      clearAndroidBuildCache()
      expect((await readAndroidBuild(dir)).available).toBe(false)
    }
  })

  it('rejects a digest or size that is not one', async () => {
    await sidecar(JSON.stringify({ ...full, sha256: 'not-a-digest' }))
    expect((await readAndroidBuild(dir)).available).toBe(false)
    await sidecar(JSON.stringify({ ...full, sizeBytes: -1 }))
    expect((await readAndroidBuild(dir)).available).toBe(false)
  })

  // The sidecar is operator-written but its url becomes a redirect the browser
  // follows, so anything that is not https is not a download location.
  it('refuses a url that is not https', async () => {
    for (const url of ['http://r2.goal.arzaroth.com/x.apk', 'javascript:alert(1)', '//evil.example/x', 'x.apk']) {
      await sidecar(JSON.stringify({ ...full, url }))
      clearAndroidBuildCache()
      expect((await readAndroidBuild(dir)).available).toBe(false)
    }
  })

  // THE stale-build bug: a host still holding the previous release's APK next to
  // a fresh sidecar. Reading the file first paired its size and digest with the
  // new sidecar's version, so the site advertised a build that never existed and
  // served the old bytes under the new version's immutable URL.
  it('wins over a stale APK left on disk', async () => {
    await write('the previous release, still sitting here')
    await sidecar(JSON.stringify(full))
    const build = await readAndroidBuild(dir)
    expect(build.remoteUrl).toBe(REMOTE)
    expect(build.sizeBytes).toBe(94098184)
    expect(build.sha256).toBe('a'.repeat(64))
  })

  // The dev path, and the fallback if a bucket publish is ever undone: with no
  // url to point at, a file that is actually here is served from here.
  it('gives way to a local file when the sidecar names no bucket object', async () => {
    await write('local bytes')
    await sidecar(JSON.stringify({ version: '9.9.9', builtAt: full.builtAt }))
    const build = await readAndroidBuild(dir)
    expect(build.remoteUrl).toBeNull()
    expect(build.sizeBytes).toBe('local bytes'.length)
  })

  // A truncated scp or an operator emptying the old APK instead of deleting it
  // must not take a live bucket build offline.
  it('is unaffected by junk at the APK path', async () => {
    await write('')
    await sidecar(JSON.stringify(full))
    expect((await readAndroidBuild(dir)).remoteUrl).toBe(REMOTE)
  })
})
