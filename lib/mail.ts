// Structured mail content: every transactional mail is either a call to action
// (a link button) or a one-time code. Both render to a branded HTML body and a
// plaintext fallback, so clients that block HTML still get a usable message.
export interface MailContent {
  title: string
  intro: string
  button?: { label: string; url: string }
  code?: string
  footer?: string
}

// Brand palette lifted from the logo gradient (navy plate, violet accent).
const MAIL_NAVY = '#151b42'
const MAIL_VIOLET = '#6a5fd0'

export function renderMailText({ title, intro, button, code, footer }: MailContent): string {
  const parts = [title, '', intro]
  if (button) parts.push('', `${button.label}: ${button.url}`)
  if (code) parts.push('', code)
  if (footer) parts.push('', footer)
  return parts.join('\n')
}

export function renderMailHtml({ title, intro, button, code, footer }: MailContent): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const href = (u: string) => u.replace(/&/g, '&amp;').replace(/"/g, '%22')
  const buttonBlock = button
    ? `<tr><td style="padding:24px 32px 4px">
           <a href="${href(button.url)}" style="display:inline-block;background:${MAIL_VIOLET};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px;font-size:15px">${esc(button.label)}</a>
         </td></tr>
         <tr><td style="padding:12px 32px 0">
           <p style="margin:0;font-size:12px;color:#9a9ab0">Or paste this link into your browser:</p>
           <p style="margin:4px 0 0;font-size:12px;word-break:break-all"><a href="${href(button.url)}" style="color:${MAIL_VIOLET}">${esc(button.url)}</a></p>
         </td></tr>`
    : ''
  const codeBlock = code
    ? `<tr><td style="padding:24px 32px 4px">
           <span style="display:inline-block;background:#f1eefe;color:#3a2f8f;font-family:'SFMono-Regular',Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:8px;padding:14px 24px;border-radius:8px">${esc(code)}</span>
         </td></tr>`
    : ''
  const footerBlock = footer
    ? `<tr><td style="padding:20px 32px 0"><p style="margin:0;font-size:13px;color:#8a8aa0">${esc(footer)}</p></td></tr>`
    : ''
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        <tr><td style="background:${MAIL_NAVY};padding:20px 32px"><span style="font-size:20px;font-weight:700;color:#a99bff">Nostragoalus</span></td></tr>
        <tr><td style="padding:28px 32px 0"><h1 style="margin:0 0 12px;font-size:20px;color:#1a1a2e">${esc(title)}</h1><p style="margin:0;font-size:15px;line-height:1.6;color:#444">${esc(intro).replace(/\n/g, '<br>')}</p></td></tr>
        ${buttonBlock}${codeBlock}${footerBlock}
        <tr><td style="padding:24px 32px 28px"><p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#9a9ab0">Nostragoalus</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// Mail works only when an SMTP transport is configured (NUXT_SMTP_URL,
// e.g. smtp://user:pass@host:587); TOTP authenticator 2FA needs nothing.
export async function sendMail(to: string, subject: string, content: MailContent): Promise<void> {
  const smtpUrl = process.env.NUXT_SMTP_URL
  if (!smtpUrl) throw new Error('email unavailable: NUXT_SMTP_URL is not configured')
  const { createTransport } = await import('nodemailer')
  await createTransport(smtpUrl).sendMail({
    from: process.env.NUXT_SMTP_FROM ?? 'Nostragoalus <no-reply@nostragoalus.local>',
    to,
    subject,
    text: renderMailText(content),
    html: renderMailHtml(content),
  })
}
