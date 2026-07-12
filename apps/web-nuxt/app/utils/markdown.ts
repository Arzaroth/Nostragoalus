import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

// User-authored markdown (the league description) rendered to safe HTML. marked
// turns the source into HTML, then DOMPurify strips anything dangerous: this is
// untrusted input shown to every league member, so the sanitize step is the
// security boundary (a javascript: URL or <script> would otherwise be stored XSS).
// The allow-list is deliberately narrow - the formatting a blurb needs, no more.

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'del', 's',
  'blockquote', 'ul', 'ol', 'li',
  'a', 'img',
  'code', 'pre',
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title']

// Force external-safe anchors and no-referrer lazy images on whatever survives the
// allow-list, rather than trusting attributes the author may have written.
function hardenAttributes(node: Element): void {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('referrerpolicy', 'no-referrer')
    node.setAttribute('loading', 'lazy')
  }
}

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return ''
  const html = marked.parse(md, { async: false, breaks: true, gfm: true }) as string
  // DOMPurify is a process-wide singleton shared with other callers (e.g. the about
  // page), so scope the hook to this synchronous sanitize call and remove it after -
  // never leave it registered globally. sanitize() is sync, so add/remove bracket it
  // atomically with no chance of another render interleaving.
  DOMPurify.addHook('afterSanitizeAttributes', hardenAttributes)
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // Only http(s), mailto and relative (our /api/media) URLs; blocks javascript:/data:.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    })
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes')
  }
}
