import { createHash } from 'node:crypto'

// Client-bundle integrity fingerprint. Pure, dependency-free, and deterministic
// so the same source + toolchain always yields the same digest - that
// reproducibility is the whole point: an operator publishes the digest of an
// honest build, and a divergence in what a browser is actually served becomes
// detectable. Authored as plain ESM (not .ts) so the build-time mise-task can
// import it under node with no compile step, while the unit test still exercises
// it. See mise-tasks/build-integrity and app/pages/about.vue.

/**
 * SHA-256 of a buffer/string, lowercase hex.
 * @param {import('node:crypto').BinaryLike} data
 * @returns {string}
 */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * A single deterministic digest over a set of named chunks. Each entry is a
 * filename + the hex SHA-256 of that file's bytes. Entries are folded into
 * sorted `name<space>sha256` lines and hashed once more, so the result is
 * independent of directory-read order and changes if any chunk's name or
 * content changes.
 * @param {{ name: string, sha256: string }[]} entries
 * @returns {string} lowercase hex SHA-256
 */
export function bundleDigest(entries) {
  const manifest = entries
    .map((e) => `${e.name} ${e.sha256}`)
    .sort()
    .join('\n')
  return sha256Hex(manifest)
}

/**
 * Group a hex digest into space-separated octets so a human can compare it by
 * eye against a published value (same idea as the E2EE safety-number).
 * @param {string} hex
 * @returns {string}
 */
export function formatDigest(hex) {
  return (hex.match(/.{1,8}/g) ?? []).join(' ')
}
