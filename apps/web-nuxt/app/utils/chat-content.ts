// Tokenize a (decrypted) chat message into renderable pieces so ChatMessageContent
// can draw mentions, links and inline images as real elements instead of one
// v-html blob. Nothing here trusts the input as HTML: text is emitted verbatim for
// Vue to escape on render, and only http(s) URLs ever become a link/image src.
//
// Mentions are stored in the plaintext as `@<userId>` (the id, not the name, so a
// rename re-renders correctly); the renderer looks the current name up by id.
export type ChatToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string }
  | { type: 'image'; href: string }
  | { type: 'mention'; userId: string }

// A mention token `@<id>` (id: anything but whitespace, angle brackets or @), or
// an http(s) URL run.
const TOKEN_RE = /(@<[^\s<>@]+>)|(\bhttps?:\/\/[^\s<]+)/gi
// Trailing prose punctuation pulled back out of a URL.
const TRAILING = /[.,!?;:'")\]}]+$/
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i

function isImageUrl(href: string): boolean {
  try {
    return IMAGE_EXT.test(new URL(href).pathname)
  } catch {
    return false
  }
}

export function parseChatContent(text: string): ChatToken[] {
  const tokens: ChatToken[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) tokens.push({ type: 'text', value: text.slice(last, idx) })
    if (m[1]) {
      tokens.push({ type: 'mention', userId: m[1].slice(2, -1) })
      last = idx + m[1].length
    } else {
      const raw = m[2]!
      const href = raw.replace(TRAILING, '')
      tokens.push(isImageUrl(href) ? { type: 'image', href } : { type: 'link', href, label: href })
      const trailing = raw.slice(href.length)
      if (trailing) tokens.push({ type: 'text', value: trailing })
      last = idx + raw.length
    }
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

// The first plain (non-image) link in a message, which is the one we unfurl into
// a preview card. Null if the message has no linkable URL.
export function firstPreviewLink(tokens: ChatToken[]): string | null {
  for (const tok of tokens) if (tok.type === 'link') return tok.href
  return null
}

// The user ids @-mentioned in a message - used to flag a message as mentioning the
// reader (the unread-mention badge) without re-parsing on the render path.
export function extractMentions(text: string): string[] {
  const ids = new Set<string>()
  for (const m of text.matchAll(/@<([^\s<>@]+)>/g)) ids.add(m[1]!)
  return [...ids]
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Composer text is written/displayed with @DisplayName mentions; map each one back
// to a stable @<id> token (rename-proof) for the wire/stored form. Longest names
// first so "@John Doe" wins over "@John". The inverse of decodeMentions.
export function encodeMentions(text: string, members: readonly { userId: string; name: string }[]): string {
  let out = text
  for (const m of [...members].sort((a, b) => b.name.length - a.name.length)) {
    out = out.replace(new RegExp(`(^|\\s)@${escapeRegExp(m.name)}(?=\\s|$|[^\\w])`, 'g'), `$1@<${m.userId}>`)
  }
  return out
}

// Put a stored message back into the edit box as @DisplayName (and used by search
// so a query matches the visible name). Unknown ids fall back to unknownLabel.
export function decodeMentions(text: string, names: Record<string, string>, unknownLabel: string): string {
  return text.replace(/@<([^\s<>@]+)>/g, (_, id) => `@${names[id] ?? unknownLabel}`)
}
