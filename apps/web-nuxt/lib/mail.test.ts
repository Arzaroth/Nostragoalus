import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderMailText, renderMailHtml, sendMail } from './mail'

const transportSendMail = vi.fn()
const createTransport = vi.fn(() => ({ sendMail: transportSendMail }))
vi.mock('nodemailer', () => ({ createTransport, default: { createTransport } }))

beforeEach(() => {
  transportSendMail.mockReset()
  createTransport.mockClear()
  vi.unstubAllEnvs()
})

describe('renderMailText', () => {
  it('lays out title, intro, button, code and footer as plaintext', () => {
    const text = renderMailText({
      title: 'Reset your password',
      intro: 'Someone asked to reset it.',
      button: { label: 'Set a new password', url: 'https://goal.example/reset?token=abc' },
      footer: 'Expires in 1 hour.',
    })
    expect(text).toBe(
      ['Reset your password', '', 'Someone asked to reset it.', '', 'Set a new password: https://goal.example/reset?token=abc', '', 'Expires in 1 hour.'].join('\n'),
    )
  })

  it('renders a one-time code instead of a button', () => {
    expect(renderMailText({ title: 'Your code', intro: 'Use it:', code: '123456' })).toContain('\n123456')
  })
})

describe('renderMailHtml', () => {
  it('escapes user-influenced content and the link href', () => {
    const html = renderMailHtml({
      title: '<script>alert(1)</script>',
      intro: 'a & b',
      button: { label: 'Go', url: 'https://x.example/y?a=1&b=2"onmouseover=' },
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('a &amp; b')
    // The href has & encoded and the quote stripped, so the attribute can't break out.
    expect(html).toContain('a=1&amp;b=2')
    expect(html).not.toContain('"onmouseover=')
  })
})

describe('sendMail', () => {
  it('throws when SMTP is not configured', async () => {
    vi.stubEnv('NUXT_SMTP_URL', '')
    await expect(sendMail('player@example.com', 'Hi', { title: 'T', intro: 'I' })).rejects.toThrow(/NUXT_SMTP_URL/)
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('sends via the configured transport with rendered text and html', async () => {
    vi.stubEnv('NUXT_SMTP_URL', 'smtp://user:pass@localhost:587')
    vi.stubEnv('NUXT_SMTP_FROM', undefined as unknown as string)
    await sendMail('player@example.com', 'Reset your Nostragoalus password', {
      title: 'Reset your password',
      intro: 'Click below.',
      button: { label: 'Set a new password', url: 'https://goal.example/reset?a=1&b=2' },
    })
    expect(createTransport).toHaveBeenCalledWith('smtp://user:pass@localhost:587')
    const msg = transportSendMail.mock.calls[0]![0]
    expect(msg).toMatchObject({ to: 'player@example.com', subject: 'Reset your Nostragoalus password' })
    expect(msg.from).toContain('no-reply@nostragoalus.local') // default From
    expect(msg.text).toContain('Set a new password: https://goal.example/reset?a=1&b=2')
    expect(msg.html).toContain('Reset your password')
  })

  it('honors NUXT_SMTP_FROM when set', async () => {
    vi.stubEnv('NUXT_SMTP_URL', 'smtp://localhost:1025')
    vi.stubEnv('NUXT_SMTP_FROM', 'Custom Sender <sender@example.com>')
    await sendMail('to@example.com', 'S', { title: 'T', intro: 'I' })
    expect(transportSendMail.mock.calls[0]![0].from).toBe('Custom Sender <sender@example.com>')
  })
})
