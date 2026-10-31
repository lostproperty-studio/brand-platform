// Runs inside an uploaded tool and restyles its interface to match the portal: colours, brand fonts, type sizes,
// spacing, corners, buttons and inputs. It reads each element's own computed style and maps it onto the
// platform's design scale, so it works on any tool whatever its CSS. The artwork the tool makes (canvas, SVG,
// poster or preview areas, or whatever the studio marks) is left exactly as the tool draws it.
export const RESKIN = `
(function(){
  var cfg = window.LP_RESKIN; if (!cfg) return;
  var hide = document.createElement('style'); hide.textContent = 'html{visibility:hidden}'; document.documentElement.appendChild(hide);
  var reveal = function(){ if (hide.parentNode) hide.parentNode.removeChild(hide); };
  setTimeout(reveal, 1500);
  var sheet = document.createElement('style'); sheet.id = 'lp-reskin';
  var SIZES = [11,12,13,15,17,22,28,36];
  var SPACE = [0,2,4,6,8,10,12,16,20,24,32,40,48,64,80];
  var ART_RE = /(art-?board|canvas|preview|poster|stage|output|render|artwork|design-area|frame)/i;
  var SKIP = { SCRIPT:1, STYLE:1, LINK:1, META:1, HEAD:1, TITLE:1, NOSCRIPT:1, BR:1, svg:1, SVG:1, CANVAS:1, IMG:1, VIDEO:1, IFRAME:1, PICTURE:1, OBJECT:1, EMBED:1 };
  var n = 0, rules = {}, pageLight = true;
  var BOOST = ':not(#lp\\\\#a):not(#lp\\\\#b)';
  function snap(v, scale){ var best = scale[0]; for (var i = 0; i < scale.length; i++) if (Math.abs(scale[i] - v) < Math.abs(best - v)) best = scale[i]; return best; }
  function rgb(s){ var m = s && s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; var p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(parseFloat); return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c){ return (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255; }
  function chroma(c){ return (Math.max(c.r,c.g,c.b) - Math.min(c.r,c.g,c.b)) / 255; }
  function isArtwork(el){
    if (el.hasAttribute('data-lp-artwork')) return true;
    if (cfg.artwork) { try { if (el.matches(cfg.artwork)) return true; } catch(e) {} }
    var tag = el.tagName; if (tag === 'CANVAS' || tag === 'svg' || tag === 'SVG') return true;
    var id = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
    if (ART_RE.test(id)) { var r = el.getBoundingClientRect(); if (r.width >= 200 && r.height >= 150) return true; }
    return false;
  }
  function isControl(el){ var t = el.tagName; return t === 'BUTTON' || t === 'SELECT' || t === 'TEXTAREA' || (t === 'INPUT' && ['checkbox','radio','range','color','file','hidden'].indexOf((el.type||'').toLowerCase()) < 0) || el.getAttribute('role') === 'button' || (t === 'A' && /\\b(btn|button)\\b/i.test(el.className)); }
  function isButton(el){ var t = el.tagName; return t === 'BUTTON' || el.getAttribute('role') === 'button' || (t === 'INPUT' && ['button','submit','reset'].indexOf((el.type||'').toLowerCase()) >= 0) || (t === 'A' && /\\b(btn|button)\\b/i.test(el.className)); }
  function decls(el, cs){
    var d = [], tag = el.tagName, heading = /^H[1-6]$/.test(tag);
    var size = parseFloat(cs.fontSize) || 13, weight = parseInt(cs.fontWeight, 10) || 400;
    var display = heading || size >= 20 || (weight >= 600 && size >= 16);
    // Type: brand fonts, the platform's size scale, lighter weights
    d.push('font-family:' + (display ? cfg.display : cfg.body));
    var s = snap(size, SIZES); if (display && s > 28) s = 28; if (!display && s > 17) s = 15;
    d.push('font-size:' + s + 'px');
    d.push('font-weight:' + (display ? 400 : weight >= 600 ? 500 : weight < 400 ? 400 : weight));
    d.push('letter-spacing:' + (cs.textTransform === 'uppercase' && s <= 12 ? '0.04em' : display ? '-0.01em' : 'normal'));
    d.push('line-height:' + (display ? '1.15' : '1.4'));
    // Colour: light surfaces, black text, grey for secondary text, black for primary actions
    var bg = rgb(cs.backgroundColor), fg = rgb(cs.color), hasBg = bg && bg.a > 0.05 && !(cs.backgroundImage && cs.backgroundImage !== 'none');
    var newBg = null;
    if (isButton(el)) {
      // Primary = the tool's accent colour, a selected state, or a dark button on a light page
      var grad = cs.backgroundImage && cs.backgroundImage.indexOf('gradient') >= 0;
      var primary = grad || (hasBg && (chroma(bg) > 0.25 || (pageLight && lum(bg) < 0.35))) || el.getAttribute('type') === 'submit' || /\\b(primary|cta|accent|active|selected|is-active|is-selected|current)\\b/i.test(typeof el.className === 'string' ? el.className : '') || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true';
      newBg = primary ? '#000000' : '#efefef';
      d.push('background-color:' + newBg, 'background-image:none', 'color:' + (primary ? '#ffffff' : '#000000'), 'border:0', 'border-radius:999px', 'box-shadow:none', 'text-transform:none', 'min-height:28px', 'padding-top:0', 'padding-bottom:0', 'padding-left:' + (el.textContent.trim() ? '12px' : '0'), 'padding-right:' + (el.textContent.trim() ? '12px' : '0'), 'font-size:12px', 'font-family:' + cfg.body, 'font-weight:400', 'cursor:pointer');
      return d;
    }
    if (isControl(el)) {
      d.push('box-sizing:border-box', 'max-width:100%', 'background-color:#efefef', 'color:#000000', 'border:0', 'box-shadow:none', 'border-radius:' + (tag === 'TEXTAREA' ? '10px' : '999px'), 'font-size:13px', 'font-family:' + cfg.body);
      if (tag !== 'TEXTAREA') d.push('height:32px', 'min-height:0', 'padding-top:0', 'padding-bottom:0', 'padding-left:12px', 'padding-right:12px', 'background-image:none');
      else d.push('padding:8px 12px');
      return d;
    }
    if (tag === 'BODY' || tag === 'HTML') { newBg = '#ffffff'; d.push('background-color:#ffffff', 'background-image:none'); }
    else if (hasBg) {
      var L = lum(bg);
      newBg = L > 0.94 ? '#ffffff' : L > 0.8 && chroma(bg) < 0.12 ? '#f7f7f7' : chroma(bg) > 0.3 && el.getBoundingClientRect().width < 160 ? '#000000' : '#f7f7f7';
      d.push('background-color:' + newBg);
    }
    if (fg) {
      var onDark = newBg === '#000000';
      var Lf = lum(fg);
      d.push('color:' + (onDark ? '#ffffff' : Lf > 0.38 && Lf < 0.8 && !display ? '#767676' : '#000000'));
    }
    // Lines, corners and shadows
    if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) || parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth)) d.push('border-color:#ededed');
    if (parseFloat(cs.borderTopLeftRadius) > 0 && parseFloat(cs.borderTopLeftRadius) < 100) d.push('border-radius:6px');
    if (cs.boxShadow && cs.boxShadow !== 'none') d.push('box-shadow:none');
    // Spacing: snap to the platform's scale
    ['padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-bottom','row-gap','column-gap'].forEach(function(p){
      var v = cs.getPropertyValue(p); if (!v || v === 'normal' || v.indexOf('px') < 0) return; var x = parseFloat(v); if (x <= 0) return; d.push(p + ':' + snap(x, SPACE) + 'px');
    });
    return d;
  }
  function walk(root, out){
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    if (root !== document.body && root !== document.documentElement && isArtwork(root)) { root.setAttribute('data-lp-art', ''); return; }
    out.push(root);
    for (var c = root.firstElementChild; c; c = c.nextElementSibling) walk(c, out);
  }
  var queued = false, dirty = [];
  function run(){
    queued = false;
    var targets = dirty.length ? dirty : [document.body]; dirty = [];
    var els = []; targets.forEach(function(t){ if (document.contains(t)) walk(t, els); });
    // Read the tool's own styles with ours switched off, then write the mapped values
    sheet.disabled = true;
    var pb = rgb(getComputedStyle(document.body).backgroundColor); if (!pb || pb.a < 0.05) pb = rgb(getComputedStyle(document.documentElement).backgroundColor);
    pageLight = !pb || pb.a < 0.05 || lum(pb) > 0.5;
    var computed = els.map(function(el){ return decls(el, getComputedStyle(el)); });
    sheet.disabled = false;
    els.forEach(function(el, i){ var id = el.getAttribute('data-lp-s') || String(++n); el.setAttribute('data-lp-s', id); rules[id] = '[data-lp-s="' + id + '"]' + BOOST + '{' + computed[i].map(function(x){ return x + '!important'; }).join(';') + '}'; });
    sheet.textContent = 'html,body' + BOOST + '{background:#ffffff!important;color:#000000!important;font-family:' + cfg.body + '!important}\\n' +
      '[data-lp-s]:is(button,[role=button],a)' + BOOST + ':hover{filter:brightness(.94)}\\n[data-lp-s]:focus-visible' + BOOST + '{outline:2px solid #000!important;outline-offset:1px!important}\\n' +
      'input[type=range],input[type=checkbox],input[type=radio]{accent-color:#000}\\n' + Object.keys(rules).map(function(k){ return rules[k]; }).join('\\n');
    if (!sheet.parentNode) (document.head || document.documentElement).appendChild(sheet);
    reveal();
  }
  function queue(el){ if (el) dirty.push(el); if (!queued) { queued = true; requestAnimationFrame(run); } }
  function start(){
    run();
    // Tools change their interface as you use them: restyle what changes
    new MutationObserver(function(list){
      list.forEach(function(m){
        if (m.target === sheet || (m.target.closest && m.target.closest('[data-lp-art]'))) return;
        if (m.type === 'childList') m.addedNodes.forEach(function(x){ if (x.nodeType === 1) queue(x); });
        else if (m.attributeName !== 'data-lp-s' && m.target.nodeType === 1) queue(m.target);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected', 'disabled'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;
