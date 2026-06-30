// Read mail out of the maildev catcher the dev/preview stack already runs
// (NUXT_SMTP_URL=smtp://maildev:1025, HTTP inbox on :1080).
const MAILDEV = process.env.E2E_MAILDEV_URL ?? 'http://localhost:1080'

interface Mail {
  id: string
  subject: string
  text: string
  html: string
  to: { address: string }[]
}

export async function clearMail(): Promise<void> {
  await fetch(`${MAILDEV}/email/all`, { method: 'DELETE' }).catch(() => {})
}

// Poll the inbox until a mail to `toAddress` (optionally matching a subject
// substring) arrives. Returns the newest match.
export async function waitForMail(
  toAddress: string,
  opts: { subjectIncludes?: string; timeoutMs?: number } = {},
): Promise<Mail> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000)
  let last = ''
  while (Date.now() < deadline) {
    const mails = (await (await fetch(`${MAILDEV}/email`)).json()) as Mail[]
    const found = mails
      .filter((m) => m.to?.some((t) => t.address.toLowerCase() === toAddress.toLowerCase()))
      .filter((m) => !opts.subjectIncludes || m.subject?.includes(opts.subjectIncludes))
      .at(-1)
    if (found) return found
    last = `${mails.length} mails, none to ${toAddress}`
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`no mail to ${toAddress}${opts.subjectIncludes ? ` (subject ~ "${opts.subjectIncludes}")` : ''} within timeout (${last})`)
}

// First http(s) link in the body (text + html) whose URL contains `pathIncludes`.
export function linkFromMail(mail: Mail, pathIncludes: string): string {
  const body = `${mail.text ?? ''}\n${mail.html ?? ''}`
  const urls = body.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  const link = urls.find((u) => u.includes(pathIncludes))
  if (!link) throw new Error(`no link containing "${pathIncludes}" in mail "${mail.subject}"`)
  return link.replace(/&amp;/g, '&')
}
