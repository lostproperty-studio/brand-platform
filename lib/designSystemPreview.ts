import type { DSSpec } from '@/lib/designSystem';
import { contrast } from '@/lib/designSystem';

// preview.html: the design system in use, in the brand. Foundations, elements, modules and whole layouts (a landing
// page, social posts, slides, an email header, a poster), all built from the ds- classes, with a light/dark switch.
// Copy is the brand's own words from the guidelines; where there are none, a placeholder in [brackets].

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type Url = (path: string) => string;

function words(s: DSSpec) {
  const f = s.form;
  const first = (t?: string) => (t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)[0];
  return {
    name: s.client,
    line: first(s.line) || `[${s.client}’s line]`,
    intro: first(f.intro) || first(f.purpose) || `[A short welcome: what ${s.client} is and who it’s for.]`,
    idea: first(f.idea) || first(s.line) || `[The idea, in one sentence.]`,
    purpose: first(f.purpose) || `[Why ${s.client} exists.]`,
    audience: first(f.audience) || '[Who it’s for]',
    values: s.values.length ? s.values : ['[Value one]', '[Value two]', '[Value three]'],
    // Interface labels for the samples; the guidelines' chapter names aren't the brand's website sections
    sections: ['About', 'What’s on', 'Spaces', 'Visit', 'Contact'],
    like: s.voice.like[0]
  };
}

/** The logo for a ground: an <img> pair that swaps with the theme, or the name in the display face */
function logoHtml(s: DSSpec, url: Url, opts: { h?: number; symbol?: boolean; ground?: 'auto' | 'light' | 'dark' } = {}) {
  const h = opts.h || 28;
  const onL = (opts.symbol && s.logo.symbolOnLight) || s.logo.onLight, onD = (opts.symbol && s.logo.symbolOnDark) || s.logo.onDark || onL;
  if (!onL && !onD) return `<span class="title" style="font-size:${Math.round(h * 0.9)}px">${esc(s.client)}</span>`;
  if (opts.ground === 'light') return `<img src="${esc(url(onL || onD!))}" alt="${esc(s.client)}" style="height:${h}px;width:auto">`;
  if (opts.ground === 'dark') return `<img src="${esc(url(onD || onL!))}" alt="${esc(s.client)}" style="height:${h}px;width:auto">`;
  return `<img class="ds-logo-light" src="${esc(url(onL || onD!))}" alt="${esc(s.client)}" style="height:${h}px;width:auto"><img class="ds-logo-dark" src="${esc(url(onD || onL!))}" alt="" aria-hidden="true" style="height:${h}px;width:auto">`;
}
const img = (s: DSSpec, url: Url, i: number, alt = '') => s.images.length ? `<img src="${esc(url(s.images[i % s.images.length]))}" alt="${esc(alt)}" loading="lazy">` : '';
/** Where a photo would go: the photo, or (with none supplied) a composition of the palette and the logo */
const art = (s: DSSpec, url: Url, i: number) => s.images.length ? img(s, url, i) : `<div class="pv-mosaic"><div style="background:${s.lt.ink};display:flex;align-items:flex-end;padding:8%">${logoHtml(s, url, { h: 40, symbol: true, ground: 'dark' })}</div><div style="background:var(--accent)"></div><div style="${block(s, 2)}"></div><div style="background:var(--fill-2)"></div></div>`;
const block = (s: DSSpec, i: number) => { const c = s.brandCols.filter((x) => x.hex.toUpperCase() !== s.lt.surface.toUpperCase()); const col = c.length ? c[i % c.length].hex : s.accent; return `background:${col}`; };
const icon = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ARROW = icon('<path d="M5 12h14M13 6l6 6-6 6"/>');

/** Small previews, one per component (also the component folders' preview.html) */
export function componentPreviews(s: DSSpec, url: Url) {
  const w = words(s);
  return {
    Button: `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="ds-btn primary">Book a visit ${ARROW}</button><button class="ds-btn accent">Highlight</button><button class="ds-btn">Default</button><button class="ds-btn outline">Outline</button><button class="ds-btn ghost">Ghost</button><button class="ds-btn sm">Small</button><button class="ds-btn" disabled>Disabled</button></div>`,
    Input: `<form style="display:grid;gap:16px;max-width:420px" onsubmit="return false"><div class="ds-field"><label class="ds-label" for="pv-n">Name</label><input class="ds-input" id="pv-n" placeholder="e.g. Alex Morgan"></div><div class="ds-field"><label class="ds-label" for="pv-e">Email</label><input class="ds-input" id="pv-e" type="email" placeholder="name@company.com"><span class="ds-hint">We’ll only use it to reply.</span></div><div class="ds-field"><label class="ds-label" for="pv-s">Enquiry</label><select class="ds-select" id="pv-s"><option>${esc(w.sections[0])}</option><option>${esc(w.sections[1] || 'Other')}</option></select></div><div class="ds-field"><label class="ds-label" for="pv-m">Message</label><textarea class="ds-textarea" id="pv-m" placeholder="Tell us a little more"></textarea></div><label class="ds-check"><input type="checkbox" checked> Keep me posted</label><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="ds-chip on" aria-pressed="true">All</button>${w.sections.slice(0, 3).map((x) => `<button type="button" class="ds-chip" aria-pressed="false">${esc(x)}</button>`).join('')}</div><div><button class="ds-btn primary">Send</button></div></form>`,
    Tag: `<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="ds-tag">Default</span><span class="ds-tag accent">Highlight</span><span class="ds-tag ink">New</span><span class="ds-tag line">Outline</span></div>`,
    Card: `<div class="ds-grid" style="--cols:3">${w.values.slice(0, 3).map((v, i) => `<a class="ds-card${i === 2 ? ' accent' : ''}" href="#"><div class="media" style="${s.images.length ? '' : block(s, i)}">${img(s, url, i)}</div><p class="eyebrow">${String(i + 1).padStart(2, '0')}</p><h3 class="title">${esc(v)}</h3><p class="mute" style="margin:0">[One line about it.]</p></a>`).join('')}</div>`,
    Navigation: `<nav class="ds-nav" aria-label="Sample"><a class="brand" href="#">${logoHtml(s, url)}</a><div class="links">${w.sections.slice(0, 4).map((x, i) => `<a href="#"${i === 0 ? ' aria-current="page"' : ''}>${esc(x)}</a>`).join('')}</div><a class="ds-btn primary sm" href="#">Get in touch</a></nav><div class="ds-tabs" role="tablist" style="margin-top:24px">${['Overview', 'Details', 'Downloads'].map((x, i) => `<button class="ds-tab${i === 0 ? ' on' : ''}" role="tab" aria-selected="${i === 0}">${x}</button>`).join('')}</div>`,
    Hero: `<section class="ds-section tight" style="padding:40px"><div class="ds-hero split"><div style="display:grid;gap:20px"><p class="eyebrow">${esc(w.audience)}</p><h1 class="display">${esc(w.line)}</h1><p class="lede">${esc(w.intro)}</p><div class="actions"><a class="ds-btn primary lg" href="#">Find out more ${ARROW}</a><a class="ds-btn outline lg" href="#">Contact</a></div></div><div class="art">${art(s, url, 0)}</div></div></section>`,
    Grid: `<ol class="ds-list">${w.sections.slice(0, 4).map((x, i) => `<li><span class="n">${String(i + 1).padStart(2, '0')}</span><div><h3 class="title">${esc(x)}</h3><p class="mute" style="margin:6px 0 0">[A line about this.]</p></div></li>`).join('')}</ol>`,
    Statement: `<section class="ds-section accent" style="padding:56px 40px"><p class="eyebrow" style="margin-bottom:20px">The idea</p><p class="ds-statement">${esc(w.idea)}</p></section>`,
    Footer: footer(s, url)
  } as Record<string, string>;
}

function footer(s: DSSpec, url: Url) {
  const w = words(s);
  return `<footer class="ds-footer"><div style="display:grid;gap:14px;align-content:start">${logoHtml(s, url, { h: 32 })}<p class="mute" style="margin:0;max-width:30ch">${esc(w.line)}</p></div>${[['Explore', w.sections.slice(0, 4)], ['Visit', ['[Address line]', '[Opening hours]', 'Getting here']], ['Follow', ['Instagram', 'LinkedIn', 'Newsletter']]].map(([h, l]) => `<div><h4>${esc(h as string)}</h4>${(l as string[]).map((x) => `<a href="#">${esc(x)}</a>`).join('')}</div>`).join('')}<div class="base"><span>© ${new Date().getFullYear()} ${esc(s.client)}</span><span>[Legal] · [Privacy]</span></div></footer>`;
}

/** A design-size box scaled into a frame, for layouts (a slide at 1920×1080 shown at 480 wide, say) */
const frame = (w: number, h: number, scale: number, inner: string, label: string, extra = '') => `<figure class="pv-frame"><div class="pv-fbox" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px"><div class="ds pv-fin" data-theme="light" style="width:${w}px;height:${h}px;transform:scale(${scale});${extra}">${inner}</div></div><figcaption class="eyebrow">${esc(label)}</figcaption></figure>`;

export function previewHtml(s: DSSpec, opts: { css: string; url: Url; standalone?: boolean; fontCss?: string; notes?: boolean }) {
  const url = opts.url;
  const w = words(s);
  const C = componentPreviews(s, url);
  const D = s.roleStyle('display'), H = s.roleStyle('headline');
  const swatch = (name: string, hex: string, sub: string) => `<div class="pv-sw"><div class="pv-chip" style="background:${hex};color:${contrast('#000000', hex) > contrast('#FFFFFF', hex) ? '#000' : '#fff'}"><span>Aa</span></div><p><b>${esc(name)}</b><br><span class="mute">${esc(sub)}</span></p></div>`;
  const roleSw = (t: string, label: string) => { const tok = s.colour.find((x) => x.name === t)!; const lv = typeof tok.value === 'string' ? tok.value : tok.value.light; const dv = typeof tok.value === 'string' ? tok.value : tok.value.dark; return `<div class="pv-sw"><div class="pv-chip split"><i style="background:${lv}"></i><i style="background:${dv}"></i></div><p><b>${label}</b> <code>--${t}</code><br><span class="mute">${lv}${lv !== dv ? ` · ${dv}` : ''}</span></p></div>`; };

  // Layouts, at their real design sizes
  const social1 = `<div style="position:relative;width:100%;height:100%;${s.images.length ? '' : block(s, 0)}">${s.images.length ? `<div style="position:absolute;inset:0">${img(s, url, 0).replace('<img', '<img style="width:100%;height:100%;object-fit:cover"')}</div>` : ''}<div style="position:absolute;left:80px;bottom:80px;right:80px;display:grid;gap:28px;color:#fff">${logoHtml(s, url, { h: 72, ground: 'dark' })}</div></div>`;
  const social2 = `<div style="width:100%;height:100%;background:var(--accent);color:var(--on-accent);padding:96px;display:flex;flex-direction:column;justify-content:space-between"><p class="eyebrow" style="color:inherit;opacity:.8;font-size:28px">${esc(w.sections[0])}</p><p class="display" style="font-size:${Math.round(D.size * 1.6)}px">${esc(w.line)}</p>${logoHtml(s, url, { h: 56, symbol: true, ground: contrast('#000000', s.accent) > contrast('#FFFFFF', s.accent) ? 'light' : 'dark' })}</div>`;
  const social3 = `<div style="width:100%;height:100%;background:var(--ink);color:var(--on-ink);padding:96px;display:flex;flex-direction:column;justify-content:space-between"><p class="eyebrow" style="color:inherit;opacity:.7;font-size:28px">${esc(w.values[0])}</p><p class="headline" style="font-size:${Math.round(H.size * 1.7)}px">${esc(w.like || w.idea)}</p><div style="display:flex;justify-content:space-between;align-items:end">${logoHtml(s, url, { h: 48, ground: 'dark' })}<span class="eyebrow" style="color:inherit;opacity:.7;font-size:24px">${esc(s.slug)}</span></div></div>`;
  const slide1 = `<div style="width:100%;height:100%;display:grid;grid-template-columns:1.2fr 1fr"><div style="padding:120px;display:flex;flex-direction:column;justify-content:space-between">${logoHtml(s, url, { h: 56 })}<div style="display:grid;gap:32px"><p class="eyebrow" style="font-size:24px">[Presentation · date]</p><p class="display" style="font-size:${Math.round(D.size * 1.7)}px">${esc(w.line)}</p></div></div><div style="${s.images.length ? '' : block(s, 1)};overflow:hidden">${img(s, url, 1).replace('<img', '<img style="width:100%;height:100%;object-fit:cover"')}</div></div>`;
  const slide2 = `<div style="width:100%;height:100%;padding:120px;display:grid;grid-template-rows:auto 1fr auto;gap:64px"><div style="display:flex;justify-content:space-between;align-items:start"><p class="headline" style="font-size:${Math.round(H.size * 1.4)}px;max-width:16ch">${esc(w.sections[1] || w.sections[0])}</p><span class="eyebrow" style="font-size:22px">02</span></div><div class="ds-grid" style="--cols:3;gap:56px">${w.values.slice(0, 3).map((v, i) => `<div style="display:grid;gap:20px;align-content:start;border-top:2px solid var(--ink);padding-top:28px"><span class="eyebrow" style="font-size:20px">${String(i + 1).padStart(2, '0')}</span><p class="title" style="font-size:44px">${esc(v)}</p><p class="mute" style="font-size:24px;line-height:1.45;margin:0">[Supporting point in a sentence or two.]</p></div>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center">${logoHtml(s, url, { h: 36 })}<span class="mute" style="font-size:20px">${esc(s.client)}</span></div></div>`;
  const email = `<div style="width:100%;height:100%;display:flex;flex-direction:column"><div style="padding:28px 40px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)">${logoHtml(s, url, { h: 26 })}<span class="mute" style="font-size:13px">View in browser</span></div><div style="flex:1;background:var(--ink);color:var(--on-ink);padding:48px 40px;display:grid;gap:16px;align-content:end"><p class="eyebrow" style="color:inherit;opacity:.7">[Newsletter · month]</p><p class="headline" style="font-size:40px">${esc(w.line)}</p><div><span class="ds-btn accent">Read more</span></div></div></div>`;
  const poster = `<div style="width:100%;height:100%;display:flex;flex-direction:column"><div style="flex:1.4;${s.images.length ? '' : block(s, 2)};overflow:hidden">${img(s, url, 2).replace('<img', '<img style="width:100%;height:100%;object-fit:cover"')}</div><div style="flex:1;padding:72px;display:flex;flex-direction:column;justify-content:space-between;background:var(--surface)"><p class="display" style="font-size:${Math.round(D.size * 1.5)}px">[Event title]</p><div style="display:flex;justify-content:space-between;align-items:end"><p class="title" style="font-size:36px">[Date · Place]</p>${logoHtml(s, url, { h: 64 })}</div></div></div>`;
  const landing = `${C.Navigation.split('<div class="ds-tabs"')[0]}<section class="ds-section"><div class="ds-wrap ds-hero split"><div style="display:grid;gap:24px"><p class="eyebrow">${esc(w.audience)}</p><h1 class="display">${esc(w.line)}</h1><p class="lede">${esc(w.intro)}</p><div class="actions"><a class="ds-btn primary lg" href="#">Find out more</a><a class="ds-btn outline lg" href="#">Contact</a></div></div><div class="art">${art(s, url, 0)}</div></div></section><section class="ds-section tight fill"><div class="ds-wrap" style="display:grid;gap:40px"><div style="display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap"><h2 class="headline">${esc(w.sections[1] || 'What we do')}</h2><a href="#">See everything</a></div>${C.Card}</div></section><section class="ds-section ink"><div class="ds-wrap"><p class="eyebrow" style="margin-bottom:24px">The idea</p><p class="ds-statement">${esc(w.idea)}</p></div></section><section class="ds-section tight"><div class="ds-wrap ds-split"><div class="media">${art(s, url, 1)}</div><div style="display:grid;gap:20px"><p class="eyebrow">${esc(w.sections[2] || 'About')}</p><h2 class="headline">${esc(w.purpose)}</h2><p>${esc(w.intro)}</p><div><a class="ds-btn" href="#">Read more ${ARROW}</a></div></div></div></section><section class="ds-section tight accent"><div class="ds-wrap ds-band"><h2 class="headline" style="max-width:18ch">[A clear next step]</h2><a class="ds-btn primary lg" href="#">Get in touch</a></div></section>${footer(s, url)}`;

  const notes = opts.notes && s.judgement.length ? `<section class="pv-sec pv-notes"><div class="pv-head"><p class="eyebrow">For the studio</p><h2 class="title">Judgement calls</h2><p class="mute">Where the guidelines don’t say, the system decided. Clients see these in DESIGN.md too.</p></div><ul>${s.judgement.map((j) => `<li>${esc(j)}</li>`).join('')}</ul></section>` : '';
  const PV = `
.pv { --pv-gap: var(--space-9); }
.pv-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: var(--space-5); padding: var(--space-3) var(--space-8); background: var(--surface); border-bottom: 1px solid var(--line); }
.pv-bar nav { display: flex; gap: var(--space-4); margin-left: auto; overflow-x: auto; }
.pv-bar nav a { color: var(--ink); text-decoration: none; font: var(--type-${s.roleStyle('label').name}); white-space: nowrap; }
.pv-sec { padding: var(--space-9) var(--space-8); border-bottom: 1px solid var(--line); }
.pv-head { display: grid; gap: var(--space-3); margin-bottom: var(--space-7); max-width: 720px; }
.pv-head .mute { margin: 0; }
.pv .pv-sub { margin: var(--space-8) 0 var(--space-5); }
.pv-mosaic { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1.3fr 1fr; gap: var(--space-2); width: 100%; height: 100%; background: var(--surface); }
.pv-mosaic > div { border-radius: var(--radius-card); min-height: 0; }
.pv-panel .ds-nav { padding: var(--space-3) 0; flex-wrap: wrap; gap: var(--space-4); }
.pv-panel .ds-nav .links { margin-left: 0; flex-wrap: wrap; }
.pv .ds-hero.split { align-items: center; }
.pv-cover { padding: var(--space-10) var(--space-8); display: grid; grid-template-columns: 1.3fr 1fr; gap: var(--space-8); align-items: end; border-bottom: 1px solid var(--line); }
.pv-cover .blocks { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); aspect-ratio: 1.2; }
.pv-cover .blocks div { border-radius: var(--radius-card); overflow: hidden; }
.pv-cover .blocks img { width: 100%; height: 100%; object-fit: cover; }
.pv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-5); }
.pv-sw p { margin: var(--space-3) 0 0; font: var(--type-${s.roleStyle('label').name}); font-weight: 400; }
.pv-sw b { font-weight: 500; }
.pv-sw code, .pv code { font: 12px/1.4 ui-monospace, Menlo, monospace; color: var(--mute); }
.pv-chip { height: 120px; border-radius: var(--radius-card); border: 1px solid var(--line); display: flex; align-items: flex-end; padding: var(--space-3); font: var(--type-${s.roleStyle('title').name}); overflow: hidden; }
.pv-chip.split { padding: 0; } .pv-chip.split i { flex: 1; height: 100%; }
.pv-type { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-5); padding: var(--space-5) 0; border-top: 1px solid var(--line); align-items: baseline; }
.pv-type .spec { font: 12px/1.5 ui-monospace, Menlo, monospace; color: var(--mute); }
.pv-type .s { overflow: hidden; text-overflow: ellipsis; }
.pv-space { display: grid; gap: var(--space-2); }
.pv-space div { display: grid; grid-template-columns: 90px 1fr; gap: var(--space-4); align-items: center; font: 12px/1.4 ui-monospace, Menlo, monospace; color: var(--mute); }
.pv-space i { display: block; height: 14px; background: var(--accent); border-radius: 1px; }
.pv-tile { border-radius: var(--radius-card); border: 1px solid var(--line); height: 180px; display: flex; align-items: center; justify-content: center; padding: var(--space-6); }
.pv-tile img { max-height: 72px; max-width: 80%; }
.pv-tile.dark { background: ${s.dk.surface}; border-color: transparent; }
.pv-imgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-3); }
.pv-imgs img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: var(--radius-card); }
.pv-panel { border: 1px solid var(--line); border-radius: var(--radius-card); padding: var(--space-6); margin-bottom: var(--space-5); background: var(--surface); }
.pv-panel > .eyebrow { margin-bottom: var(--space-4); }
.pv-mod { border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; margin-bottom: var(--space-6); }
.pv-row { display: flex; gap: var(--space-6); overflow-x: auto; padding-bottom: var(--space-3); align-items: flex-start; }
.pv-frame { margin: 0; flex: none; display: grid; gap: var(--space-3); }
.pv-fbox { overflow: hidden; border-radius: var(--radius-card); box-shadow: 0 0 0 1px var(--line); background: var(--surface); }
.pv-fin { transform-origin: 0 0; overflow: hidden; }
.pv-browser { border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; }
.pv-browser .chrome { display: flex; gap: 6px; padding: 10px 14px; background: var(--fill); border-bottom: 1px solid var(--line); }
.pv-browser .chrome i { width: 10px; height: 10px; border-radius: 50%; background: var(--line-strong); }
.pv-notes ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; max-width: 820px; }
.pv-foot { padding: var(--space-7) var(--space-8); color: var(--mute); font: var(--type-${s.roleStyle('caption').name}); text-transform: none; letter-spacing: 0; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 760px) { .pv-bar, .pv-sec, .pv-cover, .pv-foot { padding-left: 16px; padding-right: 16px; } .pv-cover { grid-template-columns: 1fr; } .pv-type { grid-template-columns: 1fr; gap: 6px; } .pv-bar nav { display: none; } }
`;
  const body = `
<header class="pv-bar"><a href="#top" style="display:flex">${logoHtml(s, url, { h: 24 })}</a><span class="mute">Design system</span><nav aria-label="Sections"><a href="#foundations">Foundations</a><a href="#elements">Elements</a><a href="#modules">Modules</a><a href="#layouts">Layouts</a></nav><button class="ds-btn sm" type="button" onclick="var h=document.documentElement;h.dataset.theme=h.dataset.theme==='dark'?'light':'dark'" aria-label="Switch light and dark">Light / dark</button></header>
<section class="pv-cover" id="top"><div style="display:grid;gap:24px"><p class="eyebrow">${esc(s.client)} design system</p><h1 class="display">${esc(w.line)}</h1><p class="lede">Colour, type, space, components, modules and layouts, from the ${esc(s.client)} guidelines. Built for people and for AI tools.</p></div><div class="blocks"><div style="background:${s.lt.ink};display:flex;align-items:center;justify-content:center">${logoHtml(s, url, { h: 40, ground: rel0(s) ? 'dark' : 'light' })}</div><div style="background:var(--accent)"></div><div style="${s.images.length ? '' : block(s, 1)}">${img(s, url, 0)}</div><div style="background:var(--fill-2);display:flex;align-items:flex-end;padding:16px"><span class="title">Aa</span></div></div></section>
${notes}
<section class="pv-sec" id="foundations"><div class="pv-head"><p class="eyebrow">01 · Foundations</p><h2 class="headline">Colour</h2><p class="mute">Working roles in light and dark (left and right), then the palette with the text colour that reads on each.</p></div>
<div class="pv-grid">${roleSw('surface', 'Surface')}${roleSw('ink', 'Ink')}${roleSw('mute', 'Mute')}${roleSw('fill', 'Fill')}${roleSw('line-strong', 'Line')}${swatch('Accent', s.accent, `${s.r.accent.name} · text ${contrast(s.onAccent, s.accent).toFixed(1)}:1`)}</div>
<h3 class="title pv-sub">Palette</h3><div class="pv-grid">${s.brandCols.map((c) => swatch(c.name, c.hex, `${c.hex.toUpperCase()}${c.role ? ' · ' + c.role : ''}`)).join('') || '<p class="mute">No colours in the guidelines yet.</p>'}</div>
<h2 class="headline pv-sub" style="margin-top:96px">Typography</h2><p class="mute">${[s.display, s.body].filter((f, i, a) => f && a.indexOf(f) === i).map((f) => esc(f!.name)).join(' and ') || 'The system sans serif'}.</p>
<div style="margin-top:28px">${s.styles.map((x) => `<div class="pv-type"><div><b>${esc(x.name)}</b><br><span class="spec">${x.size}/${x.lineHeight} · ${x.weight}${x.tracking ? ` · ${x.tracking}em` : ''}<br>${x.family}</span></div><p class="t-${x.name} s"${x.size > 40 ? ' style="white-space:nowrap"' : ''}>${esc(x.sample)}</p></div>`).join('')}</div>
<div class="ds-grid" style="--cols:2;margin-top:96px"><div><h2 class="headline" style="margin-bottom:24px">Space</h2><div class="pv-space">${s.spacing.map((x) => `<div><span>${x.name} · ${x.value}</span><i style="width:${x.value}"></i></div>`).join('')}</div></div><div><h2 class="headline" style="margin-bottom:24px">Shape</h2><div style="display:flex;gap:16px;flex-wrap:wrap">${s.radius.filter((x) => x.name !== 'radius-pill').map((x) => `<div style="display:grid;gap:8px"><div style="width:88px;height:88px;background:var(--fill-2);border-radius:${x.value === '999px' ? '44px' : x.value}"></div><code>${x.name}<br>${x.value}</code></div>`).join('')}</div><p class="mute" style="margin-top:20px">Depth from colour and hairlines; no shadows.</p></div></div>
<h2 class="headline pv-sub" style="margin-top:96px">Logo</h2><div class="pv-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))"><div class="pv-tile" style="background:${s.lt.surface}">${logoHtml(s, url, { h: 56, ground: 'light' })}</div><div class="pv-tile dark">${logoHtml(s, url, { h: 56, ground: 'dark' })}</div>${s.logo.symbolOnLight ? `<div class="pv-tile" style="background:var(--accent)">${logoHtml(s, url, { h: 56, symbol: true, ground: contrast('#000000', s.accent) > contrast('#FFFFFF', s.accent) ? 'light' : 'dark' })}</div>` : ''}</div>
${s.images.length || s.graphics.length ? `<h2 class="headline pv-sub" style="margin-top:96px">Imagery</h2><div class="pv-imgs">${s.images.slice(0, 8).map((p) => `<img src="${esc(url(p))}" alt="" loading="lazy">`).join('')}${s.graphics.slice(0, 4).map((p) => `<div style="aspect-ratio:4/5;border-radius:var(--radius-card);background:var(--fill);display:flex;align-items:center;justify-content:center;padding:20px"><img src="${esc(url(p))}" alt="" style="max-height:100%"></div>`).join('')}</div>` : ''}
</section>
<section class="pv-sec" id="elements"><div class="pv-head"><p class="eyebrow">02 · Elements</p><h2 class="headline">Components</h2><p class="mute">The building blocks, all from tokens. Switch light and dark at the top.</p></div>
<div class="pv-panel"><p class="eyebrow">Buttons</p>${C.Button}</div>
<div class="ds-grid" style="--cols:2;gap:20px"><div class="pv-panel"><p class="eyebrow">Form</p>${C.Input}</div><div><div class="pv-panel"><p class="eyebrow">Tags</p>${C.Tag}</div><div class="pv-panel"><p class="eyebrow">Navigation</p>${C.Navigation}</div></div></div>
<div class="pv-panel"><p class="eyebrow">Cards</p>${C.Card}</div>
</section>
<section class="pv-sec" id="modules"><div class="pv-head"><p class="eyebrow">03 · Modules</p><h2 class="headline">Page modules</h2><p class="mute">Sections that pages are built from: hero, grid, statement, list, footer.</p></div>
<div class="pv-mod">${C.Hero}</div><div class="pv-mod">${C.Statement}</div><div class="pv-mod" style="padding:40px">${C.Grid}</div><div class="pv-mod">${C.Footer}</div>
</section>
<section class="pv-sec" id="layouts"><div class="pv-head"><p class="eyebrow">04 · Layouts</p><h2 class="headline">In use</h2><p class="mute">Whole pieces built only from the system. Placeholders in [brackets] are for real copy.</p></div>
<h3 class="title" style="margin-bottom:16px">Landing page</h3><div class="pv-browser"><div class="chrome"><i></i><i></i><i></i></div><div class="ds">${landing}</div></div>
<h3 class="title pv-sub">Social posts · 1080 × 1350</h3><div class="pv-row">${frame(1080, 1350, 0.25, social1, 'Image and logo')}${frame(1080, 1350, 0.25, social2, 'Type on accent')}${frame(1080, 1350, 0.25, social3, 'Statement on ink')}</div>
<h3 class="title pv-sub">Presentation · 1920 × 1080</h3><div class="pv-row">${frame(1920, 1080, 0.25, slide1, 'Title slide')}${frame(1920, 1080, 0.25, slide2, 'Content slide')}</div>
<h3 class="title pv-sub">Email header and poster</h3><div class="pv-row">${frame(640, 400, 0.6, email, 'Email · 640 wide')}${frame(1190, 1684, 0.2, poster, 'Poster · A-series')}</div>
</section>
<footer class="pv-foot"><span>${esc(s.client)} design system · generated from the guidelines</span><span>Made by Lost Property</span></footer>`;

  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(s.client)} design system</title>
${opts.standalone ? '<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="brand.css">' : ''}<style>${opts.fontCss || ''}${opts.standalone ? '' : opts.css}${PV}</style>
</head>
<body class="ds pv">${body}</body></html>`;
}
const rel0 = (s: DSSpec) => contrast('#FFFFFF', s.lt.ink) > contrast('#000000', s.lt.ink);
