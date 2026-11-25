import { createHmac, timingSafeEqual } from 'node:crypto';

// Stable file links for the connector, on the platform's own address: /api/mcp/<slug>/file/<kind>/<sig>/<path>.
// The signature is an HMAC of the kind and path keyed on the project's connector token hash, so a link never carries
// the token, never expires, and stops working when the client makes a new connector link (rotating the token).
// kit: a kit file by its kit path (assets/logo/x.svg), served from its latest build
// img: a guideline or showcase image in the previews bucket
// font: a licensed font file in the uploads bucket, only while the studio shares font files
export type LinkKind = 'kit' | 'img' | 'font';
export const LINK_KINDS: LinkKind[] = ['kit', 'img', 'font'];

export const linkSig = (tokenHash: string, slug: string, kind: LinkKind, path: string) =>
  createHmac('sha256', tokenHash).update(`${slug}\n${kind}\n${path}`).digest('base64url').slice(0, 32);

export function linkOk(tokenHash: string, slug: string, kind: LinkKind, path: string, sig: string) {
  const a = Buffer.from(linkSig(tokenHash, slug, kind, path)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** An absolute link to a file. Each path segment is encoded so storage paths with spaces or symbols survive. */
export const fileLink = (origin: string, tokenHash: string, slug: string, kind: LinkKind, path: string) =>
  `${origin}/api/mcp/${encodeURIComponent(slug)}/file/${kind}/${linkSig(tokenHash, slug, kind, path)}/${path.split('/').map(encodeURIComponent).join('/')}`;
