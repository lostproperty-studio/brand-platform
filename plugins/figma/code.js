// The Lost Property brand panel in Figma and FigJam.
// The panel itself is a page on the platform: the plugin opens it as its window. This file is the part that can change
// the file: it places logos (as vectors), photos, text and colours when the panel asks, and keeps the panel's sign-in.

// Which platform the panel comes from. Staging while we test; the live address when we release.
var PLATFORM = 'https://staging.platform.lostproperty.studio';
var KEY = 'lp-panel:figma';

figma.showUI('<script>window.location.href = ' + JSON.stringify(PLATFORM + '/panel/figma') + '</script>', { width: 360, height: 640, title: 'Lost Property' });

function placeAt(node, w, h) {
  // Into the selected frame if there is one, otherwise in the middle of what's on screen
  var sel = figma.currentPage.selection[0];
  var into = sel && (sel.type === 'FRAME' || sel.type === 'SECTION' || sel.type === 'COMPONENT') ? sel : null;
  if (into) { into.appendChild(node); node.x = Math.max(0, (into.width - w) / 2); node.y = Math.max(0, (into.height - h) / 2); }
  else { var c = figma.viewport.center; node.x = Math.round(c.x - w / 2); node.y = Math.round(c.y - h / 2); }
  figma.currentPage.selection = [node];
}

async function fontFor(family) {
  // The brand's typeface if it's installed (its regular weight), otherwise Inter
  if (family) {
    var all = await figma.listAvailableFontsAsync();
    var mine = all.filter(function (f) { return f.fontName.family.toLowerCase() === family.toLowerCase(); }).map(function (f) { return f.fontName; });
    var pick = ['Regular', 'Normal', 'Book', 'Buch', 'Roman'].map(function (s) { return mine.find(function (f) { return f.style === s; }); }).find(Boolean) || mine[0];
    if (pick) { await figma.loadFontAsync(pick); return pick; }
  }
  var inter = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(inter);
  return inter;
}

function rgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

figma.ui.onmessage = async function (m) {
  if (!m || m.lp !== 1) return;
  function reply(ok, error) { figma.ui.postMessage({ lp: 1, id: m.id, ok: ok, error: error }); }
  try {
    if (m.op === 'ready') {
      var saved = await figma.clientStorage.getAsync(KEY);
      var store = {}; store[KEY] = saved || null;
      figma.ui.postMessage({ lp: 1, op: 'init', store: store, editor: figma.editorType });
      return;
    }
    if (m.op === 'store') {
      if (m.key !== KEY) return reply(false, 'Not allowed');
      if (m.value === null) await figma.clientStorage.deleteAsync(KEY); else await figma.clientStorage.setAsync(KEY, m.value);
      return reply(true);
    }
    if (m.op === 'open') { figma.openExternal(m.url); return reply(true); }
    if (m.op === 'svg') {
      var v = figma.createNodeFromSvg(m.svg);
      v.name = m.name;
      var s = m.width / (v.width || m.width);
      v.rescale(s);
      placeAt(v, v.width, v.height);
      return reply(true);
    }
    if (m.op === 'image') {
      var img = figma.createImage(m.bytes);
      var size = await img.getSizeAsync();
      var w = 600, h = Math.round(600 * (size.height / size.width || 0.75));
      var r = figma.createRectangle();
      r.name = m.name; r.resize(w, h);
      r.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
      placeAt(r, w, h);
      return reply(true);
    }
    if (m.op === 'text') {
      var font = await fontFor(m.font);
      var t = figma.createText();
      t.fontName = font; t.characters = m.text; t.fontSize = 24;
      if (m.text.length > 60) { t.textAutoResize = 'HEIGHT'; t.resize(480, t.height); }
      placeAt(t, t.width, t.height);
      return reply(true);
    }
    if (m.op === 'fill') {
      var sel = figma.currentPage.selection.filter(function (n) { return 'fills' in n; });
      if (!sel.length) return reply(false, 'Select a shape, frame or text first');
      var paint = { type: 'SOLID', color: rgb(m.hex) };
      sel.forEach(function (n) { n.fills = [paint]; });
      return reply(true);
    }
    reply(false, 'Figma can’t do that yet');
  } catch (e) {
    reply(false, (e && e.message) || String(e));
  }
};
