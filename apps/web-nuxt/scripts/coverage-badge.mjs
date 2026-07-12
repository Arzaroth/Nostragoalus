// Writes an SVG coverage badge from vitest's json-summary output.
import { readFileSync, writeFileSync } from 'node:fs'

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
const pct = summary.total.branches.pct
const color = pct >= 98 ? '#4c1' : pct >= 90 ? '#dfb317' : '#e05d44'
const label = 'coverage'
const value = `${pct.toFixed(1)}%`
const lw = 62
const vw = 46
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${lw + vw}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${label}</text><text x="${lw + vw / 2}" y="14">${value}</text></g></svg>`
writeFileSync('.github/coverage-badge.svg', svg)
console.log(`badge: ${value}`)
