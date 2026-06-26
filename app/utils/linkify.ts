// Turn the http(s) URLs in a chat message into safe anchor tags. The whole string
// is HTML-escaped first, so the result is safe to feed to v-html; only http/https
// links become anchors (never javascript:/data:), and the href is escaped too so a
// crafted URL cannot break out of the attribute. Trailing sentence punctuation is
// kept outside the link, the way it reads in prose.

const URL_RE = /\bhttps?:\/\/[^\s<]+/gi
const TRAILING = /[.,!?;:'")\]}]+$/

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function linkify(text: string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0]
    const start = match.index ?? 0
    out += escapeHtml(text.slice(last, start))
    // Pull any trailing prose punctuation back out of the link.
    const url = raw.replace(TRAILING, '')
    const href = escapeHtml(url)
    out += `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="underline">${href}</a>`
    out += escapeHtml(raw.slice(url.length))
    last = start + raw.length
  }
  out += escapeHtml(text.slice(last))
  return out
}
