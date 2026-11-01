// Sends the platform's own emails. Two free ways, whichever is set up in the environment:
//  - Resend (RESEND_API_KEY): free for 3,000 emails a month, 100 a day.
//  - Any SMTP account (SMTP_HOST, SMTP_USER, SMTP_PASS), e.g. the studio's Google Workspace mailbox.
// With neither, the platform falls back to Supabase's own plain sign-in emails.
export type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };

export const emailProvider = (): 'resend' | 'smtp' | null => (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? 'smtp' : process.env.RESEND_API_KEY ? 'resend' : null);
export const emailFrom = () => process.env.EMAIL_FROM || `Lost Property Brand Platform <${process.env.SMTP_USER || 'platform@lostproperty.studio'}>`;

export async function sendEmail(m: Mail) {
  const provider = emailProvider();
  if (!provider) throw new Error('No email service is set up.');
  if (provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: emailFrom(), to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) })
    });
    if (!r.ok) throw new Error(`The email didn’t send: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! } });
  await t.sendMail({ from: emailFrom(), to: m.to, subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}) });
}
