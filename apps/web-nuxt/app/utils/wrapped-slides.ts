import type { WrappedDto } from '#shared/types/wrapped'

export type WrappedSlideType =
  | 'intro'
  | 'totals'
  | 'tiers'
  | 'bestPick'
  | 'biggestMiss'
  | 'jokers'
  | 'journey'
  | 'crowd'
  | 'meta'
  | 'chat'
  | 'haul'
  | 'summary'

// The deck skips slides with nothing to brag (or laugh) about, so a casual
// player gets a shorter story instead of a parade of zeroes.
export function buildSlides(w: WrappedDto): WrappedSlideType[] {
  const slides: WrappedSlideType[] = ['intro', 'totals']
  if (w.tiers.predictions > 0) slides.push('tiers')
  if (w.bestPick && w.bestPick.totalPoints > 0) slides.push('bestPick')
  if (w.biggestMiss) slides.push('biggestMiss')
  if (w.jokers.played > 0) slides.push('jokers')
  if (w.journey.length >= 2) slides.push('journey')
  if (w.crowd.bonusPoints > 0 || w.crowd.loneWolf > 0) slides.push('crowd')
  if (w.meta.champion || w.meta.bestScorer) slides.push('meta')
  if (w.chat.messages > 0 || w.chat.reactionsGiven > 0) slides.push('chat')
  if (w.haul.trophies.length > 0 || w.haul.badges.length > 0) slides.push('haul')
  slides.push('summary')
  return slides
}

// Where the climb ends. The journey replays prediction points only - the
// champion and best-scorer bonuses land at finalize and belong to no round - so
// the finish line is the final standing, not the replay's last point. A hidden
// or private user has no public rank and keeps their private replay one.
export function journeyFinishRank(w: WrappedDto): number {
  return w.totals.rank ?? w.journey[w.journey.length - 1]?.rank ?? 0
}

// Points of the journey chart mapped into a 0..100 viewBox, worst rank at the
// bottom. A single-rank journey draws flat mid-height rather than dividing by
// zero.
export function journeyPolyline(journey: WrappedDto['journey'], width = 100, height = 100): string {
  if (journey.length === 0) return ''
  const ranks = journey.map((p) => p.rank)
  const min = Math.min(...ranks)
  const max = Math.max(...ranks)
  const span = max - min
  const stepX = journey.length > 1 ? width / (journey.length - 1) : 0
  return journey
    .map((p, i) => {
      const x = journey.length > 1 ? i * stepX : width / 2
      const y = span > 0 ? ((p.rank - min) / span) * (height - 20) + 10 : height / 2
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    })
    .join(' ')
}
