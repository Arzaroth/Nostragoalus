// Pure state model for the match multi-view grid, kept out of the page so the
// URL <-> state mapping and layout math are unit-tested. A grid is a list of
// match ids (cells) plus a layout; both live in the URL query so a view is
// shareable and survives reload. Cells beyond the layout's capacity are retained
// (growing the layout back re-reveals them) but not rendered.

export const MULTIVIEW_LAYOUTS = ['1', '2x1', '2x2', '3x3'] as const
export type MultiviewLayout = (typeof MULTIVIEW_LAYOUTS)[number]

export const DEFAULT_LAYOUT: MultiviewLayout = '2x2'
export const MAX_CELLS = 9
// Autoplaying video embeds are heavy and provider-throttled - only the focused
// cell streams. Bump with care (each stream is a live iframe).
export const MAX_STREAM_CELLS = 1

export function isLayout(v: unknown): v is MultiviewLayout {
  return typeof v === 'string' && (MULTIVIEW_LAYOUTS as readonly string[]).includes(v)
}

export function gridDims(layout: MultiviewLayout): { cols: number; rows: number } {
  switch (layout) {
    case '1':
      return { cols: 1, rows: 1 }
    case '2x1':
      return { cols: 2, rows: 1 }
    case '2x2':
      return { cols: 2, rows: 2 }
    case '3x3':
      return { cols: 3, rows: 3 }
  }
}

export function capacityOf(layout: MultiviewLayout): number {
  const { cols, rows } = gridDims(layout)
  return cols * rows
}

// A query value can arrive as a string (our encoding) or, if a param repeats, an
// array; normalize both. Trim, drop blanks, dedupe (first wins), clamp to MAX_CELLS.
export function decodeCells(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.flatMap((r) => String(r).split(',')) : typeof raw === 'string' ? raw.split(',') : []
  const out: string[] = []
  for (const p of parts) {
    const id = p.trim()
    if (id && !out.includes(id)) out.push(id)
    if (out.length >= MAX_CELLS) break
  }
  return out
}

export function encodeCells(ids: string[]): string {
  return ids.join(',')
}

export function visibleCells(cells: string[], layout: MultiviewLayout): string[] {
  return cells.slice(0, capacityOf(layout))
}

export function isCellPresent(cells: string[], id: string): boolean {
  return cells.includes(id)
}

// Focus must point at a rendered cell: keep it if visible, else fall back to the
// first visible cell, else nothing.
export function resolveFocus(cells: string[], layout: MultiviewLayout, focus: string | null): string | null {
  const visible = visibleCells(cells, layout)
  if (focus && visible.includes(focus)) return focus
  return visible[0] ?? null
}

export interface MultiviewState {
  cells: string[]
  layout: MultiviewLayout
  focus: string | null
}

export function parseMultiviewQuery(q: Record<string, unknown>): MultiviewState {
  const layout = isLayout(q.layout) ? q.layout : DEFAULT_LAYOUT
  const cells = decodeCells(q.cells)
  const focus = typeof q.focus === 'string' && q.focus ? q.focus : null
  return { cells, layout, focus }
}

// Only serialize what's meaningful: cells when present, layout always, focus only
// when it resolves to a visible cell (a stale/invalid focus is dropped).
export function buildMultiviewQuery(s: MultiviewState): Record<string, string> {
  const out: Record<string, string> = { layout: s.layout }
  if (s.cells.length) out.cells = encodeCells(s.cells)
  const visible = visibleCells(s.cells, s.layout)
  if (s.focus && visible.includes(s.focus)) out.focus = s.focus
  return out
}

// Append a match if it's not already a cell and the layout has a free slot.
export function addCell(cells: string[], id: string, layout: MultiviewLayout): string[] {
  if (!id || cells.includes(id) || cells.length >= capacityOf(layout)) return cells
  return [...cells, id]
}

// Set the cell at `index` to `id`, keeping ids unique (if the match already sits
// in another cell, that duplicate is removed).
export function replaceCell(cells: string[], index: number, id: string): string[] {
  if (index < 0 || index >= cells.length || !id) return cells
  const next = cells.slice()
  next[index] = id
  const dup = next.findIndex((c, i) => c === id && i !== index)
  if (dup !== -1) next.splice(dup, 1)
  return next
}

export function removeCell(cells: string[], index: number): string[] {
  if (index < 0 || index >= cells.length) return cells
  return cells.filter((_, i) => i !== index)
}

// Whether the Tile|Stream toggle may switch `id` to Stream: an already-streaming
// cell can stay, otherwise only if we're under the concurrent-stream cap.
export function canEnableStream(streamIds: string[], id: string, cap = MAX_STREAM_CELLS): boolean {
  if (streamIds.includes(id)) return true
  return streamIds.length < cap
}
