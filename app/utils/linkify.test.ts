import { describe, it, expect } from 'vitest'
import { linkify } from './linkify'

describe('linkify', () => {
  it('escapes plain text, leaving no markup', () => {
    expect(linkify('a < b & c > d "q" \'s\'')).toBe('a &lt; b &amp; c &gt; d &quot;q&quot; &#39;s&#39;')
  })

  it('turns an http(s) URL into a safe anchor', () => {
    expect(linkify('see https://example.com/x')).toBe(
      'see <a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow" class="underline">https://example.com/x</a>',
    )
    expect(linkify('http://a.test')).toContain('href="http://a.test"')
  })

  it('keeps trailing sentence punctuation out of the link', () => {
    const out = linkify('go to https://x.test.')
    expect(out).toBe(
      'go to <a href="https://x.test" target="_blank" rel="noopener noreferrer nofollow" class="underline">https://x.test</a>.',
    )
  })

  it('links several URLs and escapes the gaps', () => {
    const out = linkify('a https://one.test & b https://two.test')
    expect(out).toContain('href="https://one.test"')
    expect(out).toContain('href="https://two.test"')
    expect(out).toContain(' &amp; b ')
  })

  it('escapes a crafted URL so it cannot break out of the attribute', () => {
    const out = linkify('https://x.test/"><img>')
    // The quote in the href is escaped, so it cannot close the attribute, and the
    // trailing tag is escaped to text - no raw markup is emitted.
    expect(out).not.toContain('<img>')
    expect(out).toContain('&lt;img&gt;')
    expect(out).toContain('href="https://x.test/&quot;&gt;"')
  })

  it('does not linkify non-http schemes', () => {
    expect(linkify('javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(linkify('ftp://x.test')).toBe('ftp://x.test')
  })

  it('handles an empty string', () => {
    expect(linkify('')).toBe('')
  })
})
