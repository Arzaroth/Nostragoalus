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
