import { describe, expect, it } from 'vitest'
import { filePathToRoute } from './route-path'

describe('filePathToRoute', () => {
  it('maps a method-suffixed nested route', () => {
    expect(filePathToRoute('predictions/joker.put.ts')).toEqual({ path: '/api/predictions/joker', method: 'put' })
  })

  it('maps a top-level GET', () => {
    expect(filePathToRoute('stats.get.ts')).toEqual({ path: '/api/stats', method: 'get' })
  })

  it('collapses an index leaf to its directory', () => {
    expect(filePathToRoute('leagues/index.get.ts')).toEqual({ path: '/api/leagues', method: 'get' })
  })

  it('turns [id] into a path param', () => {
    expect(filePathToRoute('leagues/[id].get.ts')).toEqual({ path: '/api/leagues/{id}', method: 'get' })
  })

  it('turns a [...slug] catch-all into a param', () => {
    expect(filePathToRoute('media/[...slug].get.ts')).toEqual({ path: '/api/media/{slug}', method: 'get' })
  })

  it('returns a null method when no suffix is present', () => {
    expect(filePathToRoute('webhook.ts')).toEqual({ path: '/api/webhook', method: null })
  })

  it('keeps a dotted name that is not a method verb', () => {
    expect(filePathToRoute('feed.rss.get.ts')).toEqual({ path: '/api/feed.rss', method: 'get' })
  })
})
