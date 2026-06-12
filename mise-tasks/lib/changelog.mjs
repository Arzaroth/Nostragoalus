// Changelog surgery for the release task (kept in node - a multiline
// extract/replace is brittle in sed/awk). Builtins only, no node_modules.
//   node changelog.mjs read                      -> print the [Unreleased] body
//   node changelog.mjs promote <version> <date>  -> move it into a dated section
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, version, date] = process.argv.slice(2)
const PATH = 'CHANGELOG.md'
const changelog = readFileSync(PATH, 'utf8')
const SECTION = /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[)/
const pending = (changelog.match(SECTION)?.[1] ?? '').trim()

if (mode === 'read') {
  process.stdout.write(pending)
} else if (mode === 'promote') {
  writeFileSync(
    PATH,
    changelog.replace(/## \[Unreleased\]\n[\s\S]*?(?=\n## \[)/, `## [Unreleased]\n\n## [${version}] - ${date}\n\n${pending}\n`),
  )
} else {
  console.error('usage: changelog.mjs read | promote <version> <date>')
  process.exit(1)
}
