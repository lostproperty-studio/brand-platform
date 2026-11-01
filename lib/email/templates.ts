import { env } from '@/lib/env';
import type { EmailBrand } from '@/lib/email/brand';

// The platform's emails, laid out in tables with inline styles so they look right in Gmail, Apple Mail and Outlook.
// One layout: a header in the brand (logo on its colour), a headline, a few lines, one button, and the credit.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type Email = { subject: string; preheader: string; heading: string; lines: string[]; button?: { label: string; url: string }; note?: string };

export function render(b: EmailBrand, e: Email) {
  const header = b.kind === 'studio'
    ? `<tr><td style="padding:36px 40px 0 40px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;"><img src="${b.logo}" width="${b.logoW}" height="${b.logoH}" alt="Lost Property" style="display:block;border:0;"></td><td style="vertical-align:middle;padding-left:10px;font:15px ${FONT};color:#767676;">Brand Platform</td></tr></table></td></tr>`
    : `<tr><td style="background:${b.bg};padding:44px 40px;border-radius:16px 16px 0 0;" align="left">${b.logo ? `<img src="${b.logo}" width="${b.logoW}" height="${b.logoH}" alt="${esc(b.name)}" style="display:block;border:0;max-width:100%;height:auto;">` : `<span style="font:500 26px ${FONT};color:${b.ink};letter-spacing:-0.01em;">${esc(b.name)}</span>`}</td></tr>`;
  const button = e.button ? `<tr><td style="padding:8px 40px 8px 40px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${b.button};border-radius:999px;"><a href="${esc(e.button.url)}" style="display:inline-block;padding:13px 26px;font:500 15px ${FONT};color:${b.buttonInk};text-decoration:none;border-radius:999px;">${esc(e.button.label)}</a></td></tr></table></td></tr>
    <tr><td style="padding:16px 40px 0 40px;font:12px/1.5 ${FONT};color:#767676;">Or paste this into your browser:<br><a href="${esc(e.button.url)}" style="color:#767676;word-break:break-all;">${esc(e.button.url)}</a></td></tr>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(e.subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F7F7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #EDEDED;">
${header}
<tr><td style="padding:${b.kind === 'studio' ? '28px' : '36px'} 40px 8px 40px;font:400 26px/1.2 ${FONT};color:#000000;letter-spacing:-0.01em;">${esc(e.heading)}</td></tr>
${e.lines.map((l) => `<tr><td style="padding:8px 40px 8px 40px;font:15px/1.55 ${FONT};color:#000000;">${esc(l)}</td></tr>`).join('')}
<tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
${button}
${e.note ? `<tr><td style="padding:20px 40px 0 40px;font:13px/1.5 ${FONT};color:#767676;">${esc(e.note)}</td></tr>` : ''}
<tr><td style="padding:36px 40px 32px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EDEDED;"><tr><td style="padding-top:20px;font:12px ${FONT};color:#767676;">
<a href="https://lostproperty.studio" style="color:#767676;text-decoration:none;">Designed and built by&nbsp;&nbsp;<img src="${env.appUrl()}/lp-mark-grey.png" width="32" height="8" alt="" style="border:0;vertical-align:middle;">&nbsp;&nbsp;Lost Property Studio</a></td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
  const text = [e.heading, '', ...e.lines, '', ...(e.button ? [`${e.button.label}: ${e.button.url}`, ''] : []), ...(e.note ? [e.note, ''] : []), 'Designed and built by Lost Property Studio · https://lostproperty.studio'].join('\n');
  return { subject: e.subject, html, text };
}

// ---------- the emails
export const signInEmail = (b: EmailBrand, url: string) => render(b, {
  subject: b.kind === 'client' ? `Sign in to the ${b.name} brand hub` : 'Sign in to Brand Platform',
  preheader: 'Your sign-in link. It works once, for the next hour.',
  heading: b.kind === 'client' ? `Sign in to the ${b.name} brand hub` : 'Sign in to Brand Platform',
  lines: ['Here’s your link to sign in. No password needed.'],
  button: { label: 'Sign in', url },
  note: 'The link works once and expires in an hour. If you didn’t ask to sign in, you can ignore this email.'
});

export const clientInviteEmail = (b: EmailBrand, url: string, role: string, by?: string | null) => render(b, {
  subject: `You’re invited to the ${b.name} brand hub`,
  preheader: `Everything you need to use the ${b.name} brand, in one place.`,
  heading: `You’re invited to the ${b.name} brand hub`,
  lines: [`${by ? `${by} has given you` : 'You’ve been given'} access to the ${b.name} brand hub: the guidelines, logos and files, and tools for making things on brand.`, `You’ve joined as ${role}.`],
  button: { label: 'Open the brand hub', url },
  note: 'This link signs you in once and works for an hour. After that, sign in with this email address any time.'
});

export const studioInviteEmail = (b: EmailBrand, url: string, by?: string | null) => render(b, {
  subject: 'You’ve been added to Lost Property Brand Platform',
  preheader: 'Where the studio builds and runs its clients’ brand hubs.',
  heading: 'Welcome to Brand Platform',
  lines: [`${by ? `${by} has added you` : 'You’ve been added'} to Lost Property’s Brand Platform, where the studio builds and runs its clients’ brand hubs.`],
  button: { label: 'Sign in', url },
  note: 'This link signs you in once. After that, sign in with this email address any time.'
});

export const requestUpdateEmail = (b: EmailBrand, url: string, title: string, status: string, reply?: string) => render(b, {
  subject: `Update on your request: ${title}`,
  preheader: reply ? reply.slice(0, 120) : `Your request is now ${status.toLowerCase()}.`,
  heading: `Update on your request`,
  lines: [`“${title}” is now ${status.toLowerCase()}.`, ...(reply ? [reply] : [])],
  button: { label: 'View in the brand hub', url }
});
