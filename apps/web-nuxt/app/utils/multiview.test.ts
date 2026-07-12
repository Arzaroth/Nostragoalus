import { describe, it, expect } from 'vitest'
import {
  MULTIVIEW_LAYOUTS,
  DEFAULT_LAYOUT,
  MAX_CELLS,
  isLayout,
  gridDims,
  capacityOf,
  decodeCells,
  encodeCells,
  visibleCells,
  isCellPresent,
  resolveFocus,
  parseMultiviewQuery,
  buildMultiviewQuery,
  addCell,
  replaceCell,
  removeCell,
  canEnableStream,
} from './multiview'

describe('isLayout', () => {
  it('accepts only the known layout slugs', () => {
    for (const l of MULTIVIEW_LAYOUTS) expect(isLayout(l)).toBe(true)
    expect(isLayout('4x4')).toBe(false)
    expect(isLayout('')).toBe(false)
    expect(isLayout(2)).toBe(false)
    expect(isLayout(null)).toBe(false)
  })
})

describe('gridDims / capacityOf', () => {
  it('maps each layout to its dimensions and capacity', () => {
    expect(gridDims('1')).toEqual({ cols: 1, rows: 1 })
    expect(gridDims('2x1')).toEqual({ cols: 2, rows: 1 })
    expect(gridDims('2x2')).toEqual({ cols: 2, rows: 2 })
    expect(gridDims('3x3')).toEqual({ cols: 3, rows: 3 })
    expect(capacityOf('1')).toBe(1)
    expect(capacityOf('2x1')).toBe(2)
    expect(capacityOf('2x2')).toBe(4)
    expect(capacityOf('3x3')).toBe(9)
  })
})

describe('decodeCells / encodeCells', () => {
  it('splits, trims, drops blanks and dedupes', () => {
    expect(decodeCells('a, b ,,a,c')).toEqual(['a', 'b', 'c'])
  })
  it('normalizes an array param', () => {
    expect(decodeCells(['a,b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('returns empty for non-string/array input', () => {
    expect(decodeCells(undefined)).toEqual([])
    expect(decodeCells(42)).toEqual([])
  })
  it('clamps to MAX_CELLS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `m${i}`).join(',')
    expect(decodeCells(many)).toHaveLength(MAX_CELLS)
  })
  it('round-trips through encodeCells', () => {
    expect(encodeCells(['a', 'b', 'c'])).toBe('a,b,c')
    expect(decodeCells(encodeCells(['x', 'y']))).toEqual(['x', 'y'])
  })
})

describe('visibleCells', () => {
  it('slices the cells to the layout capacity', () => {
    expect(visibleCells(['a', 'b', 'c', 'd', 'e'], '2x2')).toEqual(['a', 'b', 'c', 'd'])
    expect(visibleCells(['a', 'b', 'c'], '2x1')).toEqual(['a', 'b'])
    expect(visibleCells(['a'], '3x3')).toEqual(['a'])
  })
})

describe('isCellPresent', () => {
  it('reports membership', () => {
    expect(isCellPresent(['a', 'b'], 'b')).toBe(true)
    expect(isCellPresent(['a', 'b'], 'z')).toBe(false)
  })
})

describe('resolveFocus', () => {
  it('keeps a focus that is visible', () => {
    expect(resolveFocus(['a', 'b', 'c'], '2x2', 'b')).toBe('b')
  })
  it('falls back to the first visible cell when focus is hidden by the layout', () => {
    // 'e' exists but is beyond a 2x2 capacity -> not visible
    expect(resolveFocus(['a', 'b', 'c', 'd', 'e'], '2x2', 'e')).toBe('a')
  })
  it('falls back to the first visible cell when focus is null', () => {
    expect(resolveFocus(['a', 'b'], '2x2', null)).toBe('a')
  })
  it('is null when there are no cells', () => {
    expect(resolveFocus([], '2x2', 'a')).toBeNull()
  })
})

describe('parseMultiviewQuery', () => {
  it('parses cells, layout and focus', () => {
    expect(parseMultiviewQuery({ cells: 'a,b', layout: '2x1', focus: 'b' })).toEqual({ cells: ['a', 'b'], layout: '2x1', focus: 'b' })
  })
  it('defaults the layout and nulls a blank focus', () => {
    expect(parseMultiviewQuery({ cells: 'a', layout: 'nope', focus: '' })).toEqual({ cells: ['a'], layout: DEFAULT_LAYOUT, focus: null })
  })
  it('handles an empty query', () => {
    expect(parseMultiviewQuery({})).toEqual({ cells: [], layout: DEFAULT_LAYOUT, focus: null })
  })
})

describe('buildMultiviewQuery', () => {
  it('serializes layout always, cells when present, focus when visible', () => {
    expect(buildMultiviewQuery({ cells: ['a', 'b'], layout: '2x1', focus: 'b' })).toEqual({ layout: '2x1', cells: 'a,b', focus: 'b' })
  })
  it('omits cells when empty', () => {
    expect(buildMultiviewQuery({ cells: [], layout: '2x2', focus: null })).toEqual({ layout: '2x2' })
  })
  it('drops a focus that is not a visible cell', () => {
    // 'e' is beyond 2x2 capacity
    expect(buildMultiviewQuery({ cells: ['a', 'b', 'c', 'd', 'e'], layout: '2x2', focus: 'e' })).toEqual({ layout: '2x2', cells: 'a,b,c,d,e' })
  })
})

describe('addCell', () => {
  it('appends when absent and there is room', () => {
    expect(addCell(['a'], 'b', '2x2')).toEqual(['a', 'b'])
  })
  it('is a no-op when the id is already present', () => {
    const cells = ['a', 'b']
    expect(addCell(cells, 'b', '2x2')).toBe(cells)
  })
  it('is a no-op when the layout is full', () => {
    const cells = ['a', 'b']
    expect(addCell(cells, 'c', '2x1')).toBe(cells)
  })
  it('is a no-op for an empty id', () => {
    const cells = ['a']
    expect(addCell(cells, '', '2x2')).toBe(cells)
  })
})

describe('replaceCell', () => {
  it('replaces the cell at the index', () => {
    expect(replaceCell(['a', 'b', 'c'], 1, 'z')).toEqual(['a', 'z', 'c'])
  })
  it('removes a duplicate elsewhere to keep ids unique', () => {
    expect(replaceCell(['a', 'b', 'c'], 2, 'a')).toEqual(['b', 'a'])
  })
  it('is a no-op for an out-of-range index or empty id', () => {
    const cells = ['a', 'b']
    expect(replaceCell(cells, 5, 'z')).toBe(cells)
    expect(replaceCell(cells, -1, 'z')).toBe(cells)
    expect(replaceCell(cells, 0, '')).toBe(cells)
  })
})

describe('removeCell', () => {
  it('removes and compacts', () => {
    expect(removeCell(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })
  it('is a no-op for an out-of-range index', () => {
    const cells = ['a']
    expect(removeCell(cells, 3)).toBe(cells)
  })
})

describe('canEnableStream', () => {
  it('lets an already-streaming cell stay', () => {
    expect(canEnableStream(['a'], 'a', 1)).toBe(true)
  })
  it('blocks a new stream when at the cap', () => {
    expect(canEnableStream(['a'], 'b', 1)).toBe(false)
  })
  it('allows a new stream under the cap', () => {
    expect(canEnableStream([], 'b', 1)).toBe(true)
    expect(canEnableStream(['a'], 'b', 2)).toBe(true)
  })
})
