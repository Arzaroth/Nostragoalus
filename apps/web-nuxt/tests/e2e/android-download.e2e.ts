import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// The app reads the published APK off disk per request. In the dev/e2e stack its
// download directory is ./.data/downloads inside the bind-mounted repo, so this
// spec can publish and unpublish a build from the host and see the site follow.
const DIR = fileURLToPath(new URL('../../.data/downloads/', import.meta.url))
const APK = `${DIR}nostragoalus.apk`
const SIDECAR = `${APK}.json`
const BYTES = Buffer.from('not-a-real-apk, but bytes all the same')
const DIGEST = createHash('sha256').update(BYTES).digest('hex')

async function unpublish() {
  await rm(APK, { force: true })
  await rm(SIDECAR, { force: true })
}

/// A build whose bytes are on this host. Not what `apk-publish` produces any
/// more (see `publishToBucket`), but still the dev path and the fallback when a
/// sidecar names no bucket object.
async function publishLocally() {
  await mkdir(DIR, { recursive: true })
  await writeFile(APK, BYTES)
  await writeFile(SIDECAR, JSON.stringify({ version: '9.9.9', builtAt: '2026-09-06T09:30:00.000Z' }))
}

/// What `mise -C apps/mobile-flutter run apk-publish` leaves on the host: the
/// sidecar alone, naming an object in the bucket. The URL is never fetched here -
/// only the redirect to it is asserted - so this needs no live bucket.
const BUCKET_URL = 'https://r2.goal.arzaroth.com/apk/nostragoalus-9.9.9.apk'
async function publishToBucket() {
  await mkdir(DIR, { recursive: true })
  await rm(APK, { force: true })
  await writeFile(
    SIDECAR,
    JSON.stringify({
      version: '9.9.9',
      builtAt: '2026-09-06T09:30:00.000Z',
      sizeBytes: BYTES.length,
      sha256: DIGEST,
      url: BUCKET_URL,
    }),
  )
}

test.beforeAll(unpublish)
test.afterAll(unpublish)

test('the about page offers the Android app once a build is published', async ({ page }) => {
  await page.goto('/about')
  const card = page.locator('#android')
  await expect(card).toContainText('No build is published right now')
  await expect(card.locator('a[download]')).toHaveCount(0)

  await publishLocally()

  await page.reload()
  await expect(card).toContainText('9.9.9')
  await expect(card).toContainText('2026-09-06')
  // The fingerprint is shown grouped in eights so it can be compared by eye.
  await expect(card).toContainText(DIGEST.slice(0, 8))

  // The versioned URL, so the response can be cached forever.
  const link = card.locator('a[download]')
  await expect(link).toHaveAttribute('href', '/download/nostragoalus-9.9.9.apk')

  // Fetch the file itself rather than driving the browser's download UI: what
  // matters is that the bytes and the advertised digest agree.
  const download = await page.request.get('/download/nostragoalus-9.9.9.apk')
  expect(download.status()).toBe(200)
  expect(download.headers()['content-type']).toBe('application/vnd.android.package-archive')
  expect(download.headers()['content-disposition']).toContain('nostragoalus-9.9.9.apk')
  expect(download.headers()['cache-control']).toContain('immutable')
  expect(createHash('sha256').update(await download.body()).digest('hex')).toBe(DIGEST)

  // A client that already holds these bytes gets 304, not ~90 MB again.
  const revalidated = await page.request.get('/download/nostragoalus-9.9.9.apk', {
    headers: { 'if-none-match': `"${DIGEST}"` },
  })
  expect(revalidated.status()).toBe(304)
})

test('the stable path every installed app pinned still resolves', async ({ page }) => {
  await publishLocally()

  // Installed builds have /download/nostragoalus.apk compiled in, so it has to
  // keep answering - as a redirect to the versioned URL rather than the file.
  const redirect = await page.request.get('/download/nostragoalus.apk', {
    maxRedirects: 0,
  })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers()['location']).toBe('/download/nostragoalus-9.9.9.apk')

  // Followed, it is the real file.
  const followed = await page.request.get('/download/nostragoalus.apk')
  expect(followed.status()).toBe(200)
  expect(createHash('sha256').update(await followed.body()).digest('hex')).toBe(DIGEST)
})

// A cache in front keys on the query string, so `?x=1`, `?x=2`, ... would each
// be a miss dragging the whole file off the origin. They get a redirect instead.
test('a query string costs a redirect, not the file', async ({ page }) => {
  await publishLocally()

  const busted = await page.request.get('/download/nostragoalus-9.9.9.apk?x=1', {
    maxRedirects: 0,
  })
  expect(busted.status()).toBe(302)
  expect(busted.headers()['location']).toBe('/download/nostragoalus-9.9.9.apk')
})

test('the download 404s while no build is published', async ({ page }) => {
  await unpublish()
  const response = await page.request.get('/download/nostragoalus.apk')
  expect(response.status()).toBe(404)

  const meta = await page.request.get('/api/app/android')
  expect(meta.status()).toBe(200)
  expect(await meta.json()).toMatchObject({ available: false, sha256: null })
})

test('every public page links to the Android app', async ({ page }) => {
  await page.goto('/about')
  const footerLink = page.locator('footer a[href="/about#android"]')
  await expect(footerLink).toBeVisible()
  await footerLink.click()
  await expect(page.locator('#android')).toBeVisible()
})

// The shape apk-publish actually produces, and the path every real download
// takes: the host holds only the sidecar and points at the bucket.
test('a bucket-published build is advertised and redirected to', async ({ page }) => {
  await publishToBucket()

  // The card renders off the sidecar alone, with no file to stat or hash.
  await page.goto('/about')
  const card = page.locator('#android')
  await expect(card).toContainText('9.9.9')
  await expect(card).toContainText(DIGEST.slice(0, 8))

  const meta = await page.request.get('/api/app/android')
  expect(await meta.json()).toMatchObject({
    available: true,
    version: '9.9.9',
    sha256: DIGEST,
    sizeBytes: BYTES.length,
    downloadUrl: '/download/nostragoalus-9.9.9.apk',
  })

  // Both URLs point at the bucket, and neither streams anything from here.
  for (const path of ['/download/nostragoalus-9.9.9.apk', '/download/nostragoalus.apk']) {
    const res = await page.request.get(path, { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toBe(BUCKET_URL)
  }
})

// A host still holding the previous release's APK beside a fresh sidecar used to
// serve the OLD bytes under the NEW version's immutable URL.
test('a stale APK left on the host does not override the bucket', async ({ page }) => {
  await publishToBucket()
  await writeFile(APK, Buffer.from('the previous release, still sitting here'))

  const meta = await page.request.get('/api/app/android')
  expect(await meta.json()).toMatchObject({ version: '9.9.9', sha256: DIGEST })

  const res = await page.request.get('/download/nostragoalus-9.9.9.apk', { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toBe(BUCKET_URL)
})
