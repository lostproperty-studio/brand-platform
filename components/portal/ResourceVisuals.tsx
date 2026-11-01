import { Icon } from '@/lib/icons';
import type { Package } from '@/lib/portal/packages';

// Visual previews for resources: each package shows what's inside it, and files that aren't pictures
// (tokens, Markdown, templates) get an illustration of the kind of information they hold.

type Colour = { name: string; hex: string; role?: string };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const mix = (hex: string, to: string, t: number) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A loose hand-drawn line, used as texture on app tiles. */
function Scribble({ color, seed = 0 }: { color: string; seed?: number }) {
  const d = [`M-10 ${70 + seed * 7} C 40 ${20 + seed * 5}, 90 ${130 - seed * 6}, 150 ${60 + seed * 3} S 260 ${10 + seed * 9}, 320 ${90 - seed * 4}`, `M-20 ${140 - seed * 4} C 60 ${110 + seed * 6}, 120 ${170 - seed * 3}, 200 ${120 + seed * 5} S 300 ${150 - seed * 2}, 340 ${110 + seed * 6}`];
  return <svg className="rs-scribble" viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden>{d.map((p, i) => <path key={i} d={p} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray="1 3" opacity=".35" />)}</svg>;
}

/** The coloured tile for an app in the tray, like a cover: brand colour, the app's icon, a little texture. */
export function AppTile({ icon, colour, seed }: { icon: string; colour: string; seed: number }) {
  const dark = lum(colour) < 0.55;
  const ink = dark ? mix(colour, '#ffffff', 0.62) : mix(colour, '#000000', 0.6);
  return <span className="rs-tile" style={{ background: colour, color: ink }}><Scribble color={ink} seed={seed} /><Icon name={icon} size={56} /></span>;
}

/** Brand colours for app tiles: mid and deep tones first, so the icons read. */
export function tileColours(colours: Colour[]) {
  const usable = colours.filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex) && lum(c.hex) > 0.08 && lum(c.hex) < 0.8);
  return usable.length ? usable : ['#1E3F7A', '#5A2A14', '#3A2A80', '#6B2222', '#1E4A40'].map((hex) => ({ name: '', hex }));
}

export function DesignSystemTile({ roles }: { roles: { paper: Colour; ink: Colour; accent: Colour; onAccent: Colour } }) {
  return (
    <span className="rs-tile rs-ds" style={{ background: roles.paper.hex, color: roles.ink.hex }}>
      <span className="rs-ds-aa" style={{ fontFamily: 'var(--pt-display)' }}>Aa</span>
      <span className="rs-ds-col"><span className="rs-ds-btn" style={{ background: roles.accent.hex, color: roles.onAccent.hex }}>Button</span><span className="rs-ds-dots">{[roles.accent, roles.ink, roles.paper].map((c, i) => <i key={i} style={{ background: c.hex }} />)}</span></span>
    </span>
  );
}

/** Material-style token chip: the token's name, an arrow, and the value it stands for. */
function TokenRow({ c }: { c: Colour }) {
  return <div className="rs-tok"><span className="rs-tok-pill"><i style={{ background: c.hex }} /><span>color.{kebab(c.name) || 'brand'}</span></span><span className="rs-tok-arrow" aria-hidden>→</span><span className="rs-tok-sw" style={{ background: c.hex }} /><span className="rs-tok-hex">{c.hex}</span></div>;
}

function Doc({ tag }: { tag: string }) {
  return <div className="rs-doc"><span className="rs-doc-tag">{tag}</span><i className="h" /><i /><i /><i className="s" /><i className="h2" /><i /><i className="s" /></div>;
}

export function PackagePreview({ p, colours, logoUrl }: { p: Package; colours: Colour[]; logoUrl: string | null }) {
  if (p.cover) return <div className="rs-pv rs-cover"><img src={p.cover} alt="" /></div>;
  const imgs = p.images;
  switch (p.kind) {
    case 'logos':
      return <div className="rs-pv rs-logos" data-n={Math.min(imgs.length, 4)}>{(imgs.length ? imgs.slice(0, 4) : logoUrl ? [{ url: logoUrl, name: 'logo' }] : []).map((im) => { const light = /white|light|reverse|negative|inverse/i.test(im.name); return <span key={im.url} className={light ? 'on-dark' : ''}><img src={im.url} alt="" /></span>; })}</div>;
    case 'colours':
      return <div className="rs-pv rs-colours">{colours.slice(0, 8).map((c) => <span key={c.hex + c.name} style={{ background: c.hex, color: lum(c.hex) > 0.6 ? '#000' : '#fff' }}><em>{c.hex}</em></span>)}</div>;
    case 'fonts':
      return <div className="rs-pv rs-fonts"><span style={{ fontFamily: 'var(--pt-display)' }}>Aa</span><span className="rs-fonts-b" style={{ fontFamily: 'var(--pt-body)' }}>Bb Cc 123</span></div>;
    case 'avatars':
      return <div className="rs-pv rs-avatars">{(imgs.length ? imgs.slice(0, 3).map((im) => <span key={im.url} className="rs-av"><img src={im.url} alt="" className="full" /></span>) : [...colours].sort((a, b) => Math.abs(lum(a.hex) - 0.5) - Math.abs(lum(b.hex) - 0.5)).slice(0, 3).map((c) => <span key={c.hex} className="rs-av" style={{ background: c.hex }}>{logoUrl ? <img src={logoUrl} alt="" style={lum(c.hex) < 0.5 ? { filter: 'brightness(0) invert(1)' } : undefined} /> : null}</span>))}</div>;
    case 'tokens':
      return <div className="rs-pv rs-tokens">{colours.slice(0, 3).map((c) => <TokenRow key={c.hex + c.name} c={c} />)}<span className="rs-json">{'{ }'} JSON · CSS</span></div>;
    case 'guidelines':
      return <div className="rs-pv rs-docs"><Doc tag="MD" /><Doc tag="AGENTS" /></div>;
    case 'templates':
      return <div className="rs-pv rs-tpl"><span className="p45" style={{ background: colours[0]?.hex }}><i /><i className="s" /></span><span className="p169" style={{ background: colours[1]?.hex || '#ddd' }}><i /><i className="s" /></span></div>;
    default:
      if (imgs.length) return <div className={'rs-pv rs-mosaic' + (p.kind === 'icons' ? ' icons' : '')} data-n={Math.min(imgs.length, p.kind === 'icons' ? 8 : 4)}>{imgs.slice(0, p.kind === 'icons' ? 8 : 4).map((im) => <span key={im.url}><img src={im.url} alt="" /></span>)}</div>;
      return <div className="rs-pv rs-empty"><Icon name={p.kind === 'icons' ? 'shapes' : p.kind === 'images' ? 'image' : p.kind === 'team' ? 'doc' : 'grid'} size={40} /></div>;
  }
}
