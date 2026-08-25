// Hand the viewer a file the page generated.
//
// Two browser constraints the call sites kept re-deriving: the anchor has to be in
// the document for Firefox to honour a synthetic click, and the object URL must
// outlive the click - Firefox and Safari abort a download whose blob URL is revoked
// in the same task, which is why the revoke is deferred rather than immediate.
export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 0)
}
