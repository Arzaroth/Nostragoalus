// Vectors for the chat message wire format: how a mention is stored (`@<id>`,
// never the name, so a rename re-renders), how a composer's `@Name` is mapped
// onto it, and how a stored message tokenizes into mentions, links and inline
// images. The two clients render the SAME stored string, so any disagreement
// here shows up as a raw user id in somebody's chat.
interface RawCase {
  fn: string
  args: unknown[]
}

const MEMBERS = [
  { userId: 'u-alice', name: 'Alice' },
  { userId: 'u-john', name: 'John' },
  { userId: 'u-john-doe', name: 'John Doe' },
  { userId: 'u-accent', name: 'Zoé' },
  { userId: 'u-dot', name: 'A.B.' },
  { userId: 'u-empty', name: '' },
]

const NAMES: Record<string, string> = {
  'u-alice': 'Alice',
  'u-john': 'John',
  'u-john-doe': 'John Doe',
}

const TEXTS = [
  '',
  'plain text, nothing to see',
  '@<u-alice> hello',
  'hi @<u-alice>',
  'hi @<u-alice> and @<u-john>!',
  '@<u-alice>@<u-john>',
  // An id nobody in the room knows: a departed member, or another league's.
  'who is @<u-ghost>?',
  // Not a mention: no angle brackets, an empty id, a nested bracket, a space.
  'email me @alice',
  '@<>',
  '@<a b>',
  '@<a@b>',
  'a @< b > c',
  // Links, including the trailing-punctuation pullback and an image extension.
  'see https://example.com/page',
  'see https://example.com/page.',
  'wrapped (https://example.com/a) here',
  'https://example.com/cat.png',
  'https://example.com/cat.PNG?size=2',
  'https://example.com/not-an-image?x=.png',
  'HTTPS://EXAMPLE.COM/UP',
  'ftp://example.com/nope',
  // The combination, which is where an order-of-matching bug would show.
  '@<u-alice> look at https://example.com/x.jpg and @<u-john>',
  // Text that looks like markup: neither side may treat it as HTML.
  '<script>alert(1)</script> @<u-alice>',
]

const COMPOSER = [
  '',
  '@Alice hi',
  'hi @Alice',
  // Longest-first: "@John Doe" must not be eaten by the "@John" rule.
  '@John Doe and @John',
  '@John,@Alice',
  '@Alice@John',
  // A name that is a prefix of the written word is not a mention of it.
  '@Alicia',
  'mid@Alice word',
  '@Zoé ok',
  '@A.B. ok',
  // An empty display name must never match everything.
  'nothing @ here',
  // Regex metacharacters in a display name are literal, not a pattern.
  '@A.B.',
  // Already encoded: blessing an edit box twice must be idempotent.
  '@<u-alice> hi',
]

export async function buildCases(): Promise<RawCase[]> {
  const cases: RawCase[] = []
  for (const text of TEXTS) {
    cases.push({ fn: 'parseChatContent', args: [text] })
    cases.push({ fn: 'extractMentions', args: [text] })
    cases.push({ fn: 'decodeMentions', args: [text, NAMES, 'Someone'] })
  }
  for (const text of COMPOSER) cases.push({ fn: 'encodeMentions', args: [text, MEMBERS] })
  return cases
}
