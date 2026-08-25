// A filesystem-safe slug: lowercase, strip diacritics, non-alphanumerics to single
// dashes, trimmed. Empty input (or one with nothing ASCII in it) yields ''.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
