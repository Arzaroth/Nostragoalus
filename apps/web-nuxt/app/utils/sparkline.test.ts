import { describe, expect, it } from 'vitest'
import { SPARK_H, SPARK_W, sparkArea, sparkBands, sparkLine } from './sparkline'

interface P {
  v: number
}
const items: P[] = [{ v: 0 }, { v: 5 }, { v: 10 }]

describe('sparkBands', () => {
  it('spaces points evenly across the width with a full band each', () => {
    const b = sparkBands(items)
    expect(b.map((x) => x.x)).toEqual([0, SPARK_W / 2, SPARK_W])
    expect(b.every((x) => x.band === SPARK_W / 3)).toBe(true)
    expect(b[1].item).toBe(items[1])
  })

  it('pins a single point at x=0', () => {
    expect(sparkBands([{ v: 1 }]).map((x) => x.x)).toEqual([0])
  })

  it('returns nothing for an empty series', () => {
    expect(sparkBands([])).toEqual([])
  })
})

describe('sparkLine', () => {
  it('scales values against max, baseline at the bottom', () => {
    const line = sparkLine(sparkBands(items), (p) => p.v, 10)
    // v=0 -> y=H, v=5 -> y=H/2, v=10 -> y=0.
    expect(line).toBe(`0,${SPARK_H} ${SPARK_W / 2},${SPARK_H / 2} ${SPARK_W},0`)
  })

  it('floors max at 1 so an all-zero series never divides by zero', () => {
    const line = sparkLine(sparkBands([{ v: 0 }, { v: 0 }]), (p) => p.v, 0)
    expect(line).toBe(`0,${SPARK_H} ${SPARK_W},${SPARK_H}`)
  })
})

describe('sparkArea', () => {
  it('closes the line down to the baseline', () => {
    const area = sparkArea(sparkBands([{ v: 10 }, { v: 10 }]), (p) => p.v, 10)
    expect(area).toBe(`M0,${SPARK_H} L0,0 L${SPARK_W},0 L${SPARK_W},${SPARK_H} Z`)
  })
})
