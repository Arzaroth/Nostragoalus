import { describe, it, expect } from 'vitest'
import { parseChatContent, firstPreviewLink, extractMentions } from './chat-content'

describe('parseChatContent', () => {
  it('returns a single text token for plain text', () => {
    expect(parseChatContent('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseChatContent('')).toEqual([])
  })

  it('splits a mention out of surrounding text', () => {
    expect(parseChatContent('hi @<u1> there')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', userId: 'u1' },
      { type: 'text', value: ' there' },
    ])
  })

  it('handles a mention with a uuid-style id and back-to-back mentions', () => {
    expect(parseChatContent('@<a1b2-c3>@<x>')).toEqual([
      { type: 'mention', userId: 'a1b2-c3' },
      { type: 'mention', userId: 'x' },
    ])
  })

  it('classifies an http(s) link', () => {
    expect(parseChatContent('see https://example.com/x')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://example.com/x', label: 'https://example.com/x' },
    ])
  })

  it('classifies an image URL by extension, ignoring the query string', () => {
    expect(parseChatContent('https://cdn.test/a.PNG?v=2')).toEqual([
      { type: 'image', href: 'https://cdn.test/a.PNG?v=2' },
    ])
    expect(parseChatContent('https://media.test/x.gif')).toEqual([{ type: 'image', href: 'https://media.test/x.gif' }])
  })

  it('keeps trailing punctuation as text, out of the link', () => {
    expect(parseChatContent('go https://x.test.')).toEqual([
      { type: 'text', value: 'go ' },
      { type: 'link', href: 'https://x.test', label: 'https://x.test' },
      { type: 'text', value: '.' },
    ])
  })

  it('treats a malformed URL as a non-image link', () => {
    // `https://.gif` parses but has no real path extension, so it stays a link.
    expect(parseChatContent('https://.gif')).toEqual([{ type: 'link', href: 'https://.gif', label: 'https://.gif' }])
  })

  it('falls back to a link when the URL cannot be parsed for image detection', () => {
    // `http://[` throws in new URL(), exercising the isImageUrl catch path.
    expect(parseChatContent('http://[')).toEqual([{ type: 'link', href: 'http://[', label: 'http://[' }])
  })

  it('parses a mix of mention, link and image', () => {
    const toks = parseChatContent('@<u1> look https://a.test and https://b.test/p.jpg')
    expect(toks.map((t) => t.type)).toEqual(['mention', 'text', 'link', 'text', 'image'])
  })
})

describe('firstPreviewLink', () => {
  it('returns the first plain link, skipping images', () => {
    const toks = parseChatContent('https://i.test/a.png then https://site.test/p')
    expect(firstPreviewLink(toks)).toBe('https://site.test/p')
  })

  it('returns null when there is no plain link', () => {
    expect(firstPreviewLink(parseChatContent('just text @<u1> https://i.test/a.png'))).toBeNull()
  })
})

describe('extractMentions', () => {
  it('collects unique mentioned ids', () => {
    expect(extractMentions('@<u1> hi @<u2> bye @<u1>')).toEqual(['u1', 'u2'])
  })

  it('returns an empty array when there are no mentions', () => {
    expect(extractMentions('nobody here')).toEqual([])
  })
})
