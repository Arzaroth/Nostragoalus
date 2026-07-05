import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and a list:\n\n- one\n- two')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<li>one</li>')
  })

  it('returns empty string for empty, null or undefined input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('strips script tags and other disallowed HTML', () => {
    const html = renderMarkdown('hello <script>alert(1)</script> world')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('hello')
  })

  it('drops a javascript: link URL but keeps the text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('forces target and rel on links', () => {
    const html = renderMarkdown('[site](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('keeps images and hardens them with referrerpolicy and lazy loading', () => {
    const html = renderMarkdown('![alt](/api/media/reward/x.webp)')
    expect(html).toContain('src="/api/media/reward/x.webp"')
    expect(html).toContain('referrerpolicy="no-referrer"')
    expect(html).toContain('loading="lazy"')
  })
})
