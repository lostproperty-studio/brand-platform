import { adminClient } from '@/lib/supabase/server';
import type { PortalCtx } from '@/lib/portal/context';
import { RESKIN } from '@/lib/reskin';

export type Tool = { id: string; project_id: string; kind: 'html' | 'layouts'; name: string; icon: string; description: string; html_path: string | null; styling: 'full' | 'light' | 'none'; ai_enabled: boolean; visible: boolean; ord: number; updated_at: string; beta?: boolean };
export const TOOL_BUCKET = 'uploads';

/** The project's tools: only the ones the studio has added. Nothing is added automatically. */
export async function listTools(projectId: string, includeHidden: boolean) {
  const sb = adminClient();
  const [{ data }, { data: pr }] = await Promise.all([
    sb.from('tools').select('*').eq('project_id', projectId).order('ord').order('created_at'),
    sb.from('projects').select('content').eq('id', projectId).single()
  ]);
  // BETA lives with the per-tool settings in the project's content, so no table change is needed
  const settings = ((pr?.content as { toolSettings?: Record<string, { beta?: boolean }> } | null)?.toolSettings) || {};
  return ((data || []) as Tool[]).filter((t) => includeHidden || t.visible).map((t) => ({ ...t, beta: !!settings[t.id]?.beta }));
}

// Runs inside the tool. Lets the platform read the tool's controls, fill them in for the AI, and save/restore a person's work.
// Also gives tools that use browser storage a working stand-in, since tools run in a locked-down frame.
export const BRIDGE = `
(function(){
  var memory = {};
  function shim(){ return { getItem:function(k){return Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null;}, setItem:function(k,v){memory[k]=String(v); parent.postMessage({lp:'storage', data:memory},'*');}, removeItem:function(k){delete memory[k]; parent.postMessage({lp:'storage', data:memory},'*');}, clear:function(){memory={}; parent.postMessage({lp:'storage', data:memory},'*');}, key:function(i){return Object.keys(memory)[i]||null;}, get length(){return Object.keys(memory).length;} }; }
  try { window.localStorage.getItem('x'); } catch(e) { try { Object.defineProperty(window,'localStorage',{value:shim(),configurable:true}); Object.defineProperty(window,'sessionStorage',{value:shim(),configurable:true}); } catch(_){} }
  var n = 0;
  function visible(el){ var r = el.getBoundingClientRect(); var s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }
  function labelOf(el){
    var lab = el.labels && el.labels[0] ? el.labels[0].textContent.replace(el.labels[0].contains(el) ? el.textContent : '', '') : '';
    var t = el.getAttribute('aria-label') || lab || el.getAttribute('placeholder') || el.getAttribute('title') || '';
    if (!t && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) t = el.textContent;
    if (!t) { var p = el.closest('label'); if (p) t = p.textContent.replace(el.textContent, ''); }
    if (!t) { var prev = el.previousElementSibling; if (prev) t = prev.textContent; }
    return (t || el.name || el.id || '').replace(/\\s+/g,' ').trim().slice(0,80);
  }
  function controls(){
    var els = Array.prototype.slice.call(document.querySelectorAll('input,select,textarea,button,[contenteditable="true"],[role="button"]'));
    return els.filter(function(el){ var ty = (el.type||'').toLowerCase(); return visible(el) && ty !== 'hidden' && ty !== 'password' && ty !== 'file' && !el.disabled; }).slice(0,150).map(function(el){
      if (!el.dataset.lpId) el.dataset.lpId = 'c' + (++n);
      var ty = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.isContentEditable ? 'text' : el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || ['button','submit','reset'].indexOf((el.type||'').toLowerCase()) >= 0 ? 'button' : (el.type||'text').toLowerCase();
      var o = { id: el.dataset.lpId, type: ty, label: labelOf(el) };
      if (ty === 'select') { o.options = Array.prototype.map.call(el.options, function(x){ return x.textContent.trim(); }).slice(0,40); o.value = el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent.trim() : ''; }
      else if (ty === 'checkbox' || ty === 'radio') o.value = el.checked;
      else if (ty !== 'button') o.value = el.isContentEditable ? el.textContent : el.value;
      if (ty === 'range' || ty === 'number') { o.min = el.min; o.max = el.max; }
      return o;
    });
  }
  function setValue(el, v){
    if (el.tagName === 'SELECT') { var i = Array.prototype.findIndex.call(el.options, function(x){ return x.textContent.trim() === String(v) || x.value === String(v); }); if (i >= 0) el.selectedIndex = i; }
    else if (el.type === 'checkbox' || el.type === 'radio') el.checked = v === true || v === 'true';
    else if (el.isContentEditable) el.textContent = String(v);
    else { var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; var d = Object.getOwnPropertyDescriptor(proto,'value'); if (d && d.set) d.set.call(el, String(v)); else el.value = String(v); }
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function find(id){ return document.querySelector('[data-lp-id="'+id+'"]'); }
  function values(){ controls(); var out = {}; Array.prototype.forEach.call(document.querySelectorAll('[data-lp-id]'), function(el){ if (el.tagName === 'BUTTON') return; var k = el.id || el.name || labelOf(el) || el.dataset.lpId; out[k] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.isContentEditable ? el.textContent : el.value; }); return out; }
  function restore(v){ controls(); Array.prototype.forEach.call(document.querySelectorAll('[data-lp-id]'), function(el){ var k = el.id || el.name || labelOf(el) || el.dataset.lpId; if (Object.prototype.hasOwnProperty.call(v,k)) setValue(el, v[k]); }); }
  window.addEventListener('message', function(e){
    if (e.source !== parent || !e.data || !e.data.lp) return;
    var m = e.data, reply = function(o){ o.lp = m.lp; o.req = m.req; parent.postMessage(o,'*'); };
    if (m.lp === 'controls') reply({ controls: controls(), title: document.title, headings: Array.prototype.map.call(document.querySelectorAll('h1,h2,h3'), function(h){ return h.textContent.trim(); }).slice(0,12) });
    if (m.lp === 'apply') { var errs = []; (m.actions||[]).forEach(function(a){ var el = find(a.id); if (!el) { errs.push(a.id); return; } if (a.type === 'click') el.click(); else setValue(el, a.value); }); reply({ errors: errs }); }
    if (m.lp === 'values') reply({ values: values(), storage: memory });
    if (m.lp === 'restore') { if (m.storage) memory = m.storage; restore(m.values || {}); reply({ ok: true }); }
    if (m.lp === 'storage-init') { memory = m.data || {}; }
  });
  if (window.LP_TOOL_READY) window.LP_TOOL_READY();
  parent.postMessage({ lp: 'ready' }, '*');
})();`;

const CSS_FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };

/** The tool's HTML, repackaged for the portal: brand fonts and colours, the platform's look, brand assets, and the bridge. */
export async function prepareToolHtml(tool: Tool, ctx: PortalCtx, fontUrls: Record<string, string>, assetUrls: Record<string, string>, settings: { artwork?: string } = {}) {
  if (!tool.html_path) return null;
  const { data, error } = await adminClient().storage.from(TOOL_BUCKET).download(tool.html_path);
  if (error || !data) return null;
  let html = await data.text();
  const fonts = ctx.fonts;
  const display = fonts.find((f) => f.role === 'display' && f.files.length) || fonts.find((f) => f.files.length);
  const body = fonts.find((f) => f.role === 'body' && f.files.length) || display;
  const faces = fonts.flatMap((f) => f.files.filter((x) => fontUrls[x.path]).map((x) => `@font-face{font-family:"brand-${f.role}";src:url("${fontUrls[x.path]}") format("${CSS_FORMAT[x.format]}");font-weight:${x.weight};font-style:${x.style};font-display:swap}`)).join('\n');
  const colours = ctx.snap?.colours || [];
  const ink = '#000000', bg = '#FFFFFF';
  const vars = `:root{--lp-display:${display ? `"brand-${display.role}",` : ''}${JSON.stringify(display?.name || 'Helvetica Neue')},sans-serif;--lp-body:${body ? `"brand-${body.role}",` : ''}${JSON.stringify(body?.name || 'Helvetica Neue')},sans-serif;--lp-ink:${ink};--lp-bg:${bg};--lp-line:#ededed;--lp-fill:#f5f5f5;${colours.slice(0, 12).map((c, i) => `--lp-colour-${i + 1}:${c.hex};`).join('')}}`;
  const light = `html,body{font-family:var(--lp-body)!important}h1,h2,h3,h4{font-family:var(--lp-display)!important}button,input,select,textarea{font-family:inherit!important}`;
  // 'full' restyles the whole interface at runtime (see lib/reskin.ts); 'light' only swaps in the brand fonts
  const style = tool.styling === 'none' ? '' : `<style id="lp-theme">${faces}\n${vars}\n${tool.styling === 'light' ? light : ''}</style>`;
  const reskin = tool.styling === 'full' ? `<script>window.LP_RESKIN=${JSON.stringify({ display: `"brand-${display?.role || 'display'}",${JSON.stringify(display?.name || 'Helvetica Neue')},sans-serif`, body: `"brand-${body?.role || 'body'}",${JSON.stringify(body?.name || 'Helvetica Neue')},sans-serif`, artwork: settings.artwork || '' }).replace(/</g, '\\u003c')};</script><script>${RESKIN}</script>` : '';
  const brand = { client: ctx.project.client, colours, fonts: fonts.filter((f) => f.name).map((f) => ({ role: f.role, name: f.name, family: `brand-${f.role}` })), assets: assetUrls };
  const head = `<script>window.LP_BRAND=${JSON.stringify(brand).replace(/</g, '\\u003c')};</script><script>${BRIDGE}</script>${reskin}`;
  // Bridge first in <head> (so the storage stand-in exists before the tool's scripts run); theme last so it applies over the tool's base styles
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, style + '</head>') : style + html;
  return html;
}
