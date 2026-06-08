// Cut a release: move [Unreleased] into a dated version section, bump
// package.json, run the test gate, commit, tag, push.
// Usage: mise run release 0.9.0   (add --dry-run to preview)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: node scripts/release.mjs <x.y.z> [--dry-run]')
  process.exit(1)
}

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim()

if (sh('git status --porcelain')) {
  console.error('working tree is not clean - commit or stash first')
  process.exit(1)
}
if (sh('git tag -l', {}).split('\n').includes(`v${version}`)) {
  console.error(`tag v${version} already exists`)
  process.exit(1)
}

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const m = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[)/)
const pending = (m?.[1] ?? '').trim()
if (!pending) {
  console.error('CHANGELOG.md has no [Unreleased] content - nothing to release')
  process.exit(1)
}

const date = new Date().toISOString().slice(0, 10)
console.log(`releasing v${version} (${date}) with:\n\n${pending}\n`)
if (dryRun) {
  console.log('dry run - nothing written')
  process.exit(0)
}

writeFileSync(
  'CHANGELOG.md',
  changelog.replace(/## \[Unreleased\]\n[\s\S]*?(?=\n## \[)/, `## [Unreleased]\n\n## [${version}] - ${date}\n\n${pending}\n`),
)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.version = version
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')

console.log('running the test gate...')
execSync('pnpm test:coverage', { stdio: 'inherit', env: { ...process.env, CI: 'true' } })

execSync('git add CHANGELOG.md package.json', { stdio: 'inherit' })
execSync(`git commit -m "chore(release): ${version}"`, { stdio: 'inherit' })
execSync(`git tag -a v${version} -m "Nostragoalus ${version}"`, { stdio: 'inherit' })
execSync('git push origin main --follow-tags', { stdio: 'inherit' })
console.log(`\nreleased v${version}`)
