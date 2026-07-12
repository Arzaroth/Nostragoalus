import { describe, expect, it } from 'vitest'
import { COUNTRY_CENTROIDS } from './country-centroids'
import { FIFA_RANKING_SNAPSHOT } from '../../server/utils/champion/fifa-ranking-snapshot'

describe('COUNTRY_CENTROIDS', () => {
  it('has a centroid for every ranked FIFA tricode', () => {
    const missing = Object.keys(FIFA_RANKING_SNAPSHOT.ranks).filter((code) => !COUNTRY_CENTROIDS[code])
    expect(missing).toEqual([])
  })

  it('keeps every centroid within valid lat/lon bounds', () => {
    for (const [code, [lat, lon]] of Object.entries(COUNTRY_CENTROIDS)) {
      expect(lat, code).toBeGreaterThanOrEqual(-90)
      expect(lat, code).toBeLessThanOrEqual(90)
      expect(lon, code).toBeGreaterThanOrEqual(-180)
      expect(lon, code).toBeLessThanOrEqual(180)
    }
  })
})
