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

test.beforeAll(unpublish)
test.afterAll(unpublish)

test('the about page offers the Android app once a build is published', async ({ page }) => {
  await page.goto('/about')
  const card = page.locator('#android')
  await expect(card).toContainText('No build is published right now')
  await expect(card.locator('a[download]')).toHaveCount(0)

  // Publish one, the way `mise run apk-publish` does.
  await mkdir(DIR, { recursive: true })
  await writeFile(APK, BYTES)
  await writeFile(SIDECAR, JSON.stringify({ version: '9.9.9', builtAt: '2026-09-06T09:30:00.000Z' }))

  await page.reload()
  await expect(card).toContainText('9.9.9')
  await expect(card).toContainText('2026-09-06')
  // The fingerprint is shown grouped in eights so it can be compared by eye.
  await expect(card).toContainText(DIGEST.slice(0, 8))

  const link = card.locator('a[download]')
  await expect(link).toHaveAttribute('href', '/download/nostragoalus.apk')

  // Fetch the file itself rather than driving the browser's download UI: what
  // matters is that the bytes and the advertised digest agree.
  const download = await page.request.get('/download/nostragoalus.apk')
  expect(download.status()).toBe(200)
  expect(download.headers()['content-type']).toBe('application/vnd.android.package-archive')
  expect(download.headers()['content-disposition']).toContain('nostragoalus-9.9.9.apk')
  expect(createHash('sha256').update(await download.body()).digest('hex')).toBe(DIGEST)
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
