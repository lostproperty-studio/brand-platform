// Files the platform makes from the brand itself, rather than from the kit: colour swatch files and social avatars.

type Colour = { name: string; hex: string; role?: string };
const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colour';
const rgb = (hex: string) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const lum = (hex: string) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Adobe Swatch Exchange: opens in Illustrator, Photoshop, InDesign, Affinity and Figma plugins. */
export function aseFile(colours: Colour[]) {
  const blocks = colours.map((c) => {
    const name = c.name || c.hex;
    const nameBytes = (name.length + 1) * 2;
    const len = 2 + nameBytes + 4 + 12 + 2;
    const b = new DataView(new ArrayBuffer(6 + len));
    let o = 0;
    b.setUint16(o, 0x0001); o += 2; b.setUint32(o, len); o += 4; b.setUint16(o, name.length + 1); o += 2;
    for (const ch of name) { b.setUint16(o, ch.charCodeAt(0)); o += 2; }
    b.setUint16(o, 0); o += 2;
    for (const ch of 'RGB ') { b.setUint8(o, ch.charCodeAt(0)); o += 1; }
    for (const v of rgb(c.hex)) { b.setFloat32(o, v / 255); o += 4; }
    b.setUint16(o, 2);
    return new Uint8Array(b.buffer);
  });
  const head = new DataView(new ArrayBuffer(12));
  'ASEF'.split('').forEach((ch, i) => head.setUint8(i, ch.charCodeAt(0)));
  head.setUint16(4, 1); head.setUint16(6, 0); head.setUint32(8, blocks.length);
  const total = 12 + blocks.reduce((n, x) => n + x.length, 0);
  const out = new Uint8Array(total); out.set(new Uint8Array(head.buffer), 0);
  let o = 12; for (const x of blocks) { out.set(x, o); o += x.length; }
  return out;
}

export function colourFiles(client: string, colours: Colour[]): Record<string, Uint8Array | string> {
  const slug = kebab(client);
  return {
    [`${slug}-colours.ase`]: aseFile(colours),
    [`${slug}-colours.css`]: `/* ${client} colours */\n:root {\n${colours.map((c) => `  --${kebab(c.name)}: ${c.hex};${c.role ? ` /* ${c.role} */` : ''}`).join('\n')}\n}\n`,
    [`${slug}-colours.json`]: JSON.stringify(colours.map((c) => ({ name: c.name, hex: c.hex, rgb: rgb(c.hex), use: c.role || undefined })), null, 2) + '\n',
    [`${slug}-colours.txt`]: colours.map((c) => `${c.name}\n  HEX ${c.hex}\n  RGB ${rgb(c.hex).join(' ')}${c.role ? `\n  ${c.role}` : ''}`).join('\n\n') + '\n'
  };
}

/** Square avatars (1080 px) with the logo centred inside the circle-safe area, one per lead brand colour. */
export function avatarSvgs(client: string, colours: Colour[], logos: { light?: string; dark?: string; any: string }) {
  const picks = [...colours].sort((a, b) => Math.abs(lum(a.hex) - 0.5) - Math.abs(lum(b.hex) - 0.5)).slice(0, 3);
  const uri = (svg: string) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  return Object.fromEntries(picks.map((c) => {
    const onDark = lum(c.hex) < 0.5;
    const art = (onDark ? logos.light : logos.dark) || logos.any;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="${c.hex}"/><image x="270" y="270" width="540" height="540" preserveAspectRatio="xMidYMid meet" href="${uri(art)}" xlink:href="${uri(art)}"/></svg>`;
    return [`${kebab(client)}-avatar-${kebab(c.name)}.svg`, svg];
  }));
}

/** The logo SVGs to build avatars from: a symbol if there is one, in a light and a dark version. */
export function pickAvatarLogos(paths: string[]) {
  const svgs = paths.filter((p) => /^assets\/logo\/.+\.svg$/i.test(p));
  const symbols = svgs.filter((p) => /symbol|icon|monogram|avatar|emblem|(^|[^d])mark/i.test(p.split('/').pop()!) && !/wordmark|lockup/i.test(p));
  const pool = symbols.length ? symbols : svgs;
  const light = pool.find((p) => /white|light|reverse|negative|inverse/i.test(p));
  const dark = pool.find((p) => /black|dark|positive/i.test(p));
  return { light, dark, any: pool.find((p) => p !== light) || pool[0] };
}
