import { createHash } from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { projectBranding } from '@/lib/branding';
import { env } from '@/lib/env';

// How an email looks: Lost Property's own, or a client's (their logo on their main colour), always with the
// Lost Property credit. Email apps can't show SVG, so client logos are turned into PNGs and kept in a public folder.
export type EmailBrand = { kind: 'studio' | 'client'; name: string; bg: string; ink: string; button: string; buttonInk: string; logo: string | null; logoW: number; logoH: number };

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const BUCKET = 'email-assets';

export function studioBrand(): EmailBrand {
  return { kind: 'studio', name: 'Lost Property Brand Platform', bg: '#FFFFFF', ink: '#000000', button: '#000000', buttonInk: '#FFFFFF', logo: `${env.appUrl()}/lp-mark-email.png`, logoW: 80, logoH: 20 };
}

async function logoPng(projectId: string, svgUrl: string): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const sb = adminClient();
    const key = createHash('sha1').update(svgUrl.split('?')[0]).digest('hex').slice(0, 16);
    const path = `${projectId}/logo-${key}.png`;
    const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const meta = await fetch(pub, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    const sharp = (await import('sharp')).default;
    if (meta?.ok) { const buf = Buffer.from(await (await fetch(pub)).arrayBuffer()); const m = await sharp(buf).metadata(); return { url: pub, w: Math.round((m.width || 320) / 2), h: Math.round((m.height || 80) / 2) }; }
    const svg = Buffer.from(await (await fetch(svgUrl)).arrayBuffer());
    // Twice the display size, for sharp screens: at most 400 × 112 shown
    const png = await sharp(svg, { density: 300 }).resize({ width: 400, height: 112, fit: 'inside' }).png().toBuffer();
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => null);
    const { error } = await sb.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
    if (error) return null;
    const m = await sharp(png).metadata();
    return { url: pub, w: Math.round((m.width || 400) / 2), h: Math.round((m.height || 112) / 2) };
  } catch { return null; }
}

export async function clientBrand(slug: string): Promise<EmailBrand> {
  const b = await projectBranding(slug).catch(() => null);
  if (!b) return studioBrand();
  const primary = b.colours.find((c) => /^#[0-9A-F]{6}$/i.test(c.hex))?.hex || '#000000';
  const dark = lum(primary) < 0.5;
  const svg = dark ? b.logoLightUrl || null : b.logoUrl;
  const png = svg ? await logoPng(b.id, svg) : null;
  // No logo made for this ground: fall back to a white band with the main logo
  const bg = png || !b.logoUrl ? primary : '#FFFFFF';
  const fallback = !png && b.logoUrl && bg === '#FFFFFF' ? await logoPng(b.id, b.logoUrl) : null;
  const logo = png || fallback;
  const ink = lum(bg) < 0.5 ? '#FFFFFF' : '#000000';
  return { kind: 'client', name: b.client, bg, ink, button: lum(primary) < 0.85 ? primary : '#000000', buttonInk: lum(primary) < 0.85 && lum(primary) >= 0.5 ? '#000000' : '#FFFFFF', logo: logo?.url || null, logoW: logo?.w || 0, logoH: logo?.h || 0 };
}
