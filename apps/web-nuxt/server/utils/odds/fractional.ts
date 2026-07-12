// Sofascore quotes odds as fractional strings ("16/5"); decimal = num/den + 1.
export function fractionalToDecimal(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(value)
  if (!m) return null
  const num = Number(m[1])
  const den = Number(m[2])
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null
  return Math.round((num / den + 1) * 1000) / 1000
}
