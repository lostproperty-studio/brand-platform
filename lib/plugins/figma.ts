// The Figma plugin, built for download from a portal's Plug-ins (Resources → Plug-ins → Figma). Each download points at
// the platform it came from (staging or live) and signs in to that portal's brand first. Imported in Figma's desktop
// app with Plugins → Development → Import plugin from manifest, until it's published to the Figma Community.
import { zipSync, strToU8 } from 'fflate';

const CODE = "// The Lost Property brand panel in Figma and FigJam.\n// The panel itself is a page on the platform: the plugin opens it as its window. This file is the part that can change\n// the file: it places logos (as vectors), photos, text and colours when the panel asks, and keeps the panel's sign-in.\n\n// Which platform the panel comes from, and which brand it signs in to first. Set when the plugin is downloaded.\nvar PLATFORM = __PLATFORM__;\nvar BRAND = __BRAND__;\nvar KEY = 'lp-panel:figma';\n\nfigma.showUI('<script>window.location.href = ' + JSON.stringify(PLATFORM + '/panel/figma' + (BRAND ? '?p=' + encodeURIComponent(BRAND) : '')) + '</script>', { width: 360, height: 640, title: 'Lost Property' });\n\nfunction placeAt(node, w, h) {\n  // Into the selected frame if there is one, otherwise in the middle of what's on screen\n  var sel = figma.currentPage.selection[0];\n  var into = sel && (sel.type === 'FRAME' || sel.type === 'SECTION' || sel.type === 'COMPONENT') ? sel : null;\n  if (into) { into.appendChild(node); node.x = Math.max(0, (into.width - w) / 2); node.y = Math.max(0, (into.height - h) / 2); }\n  else { var c = figma.viewport.center; node.x = Math.round(c.x - w / 2); node.y = Math.round(c.y - h / 2); }\n  figma.currentPage.selection = [node];\n}\n\nasync function fontFor(family) {\n  // The brand's typeface if it's installed (its regular weight), otherwise Inter\n  if (family) {\n    var all = await figma.listAvailableFontsAsync();\n    var mine = all.filter(function (f) { return f.fontName.family.toLowerCase() === family.toLowerCase(); }).map(function (f) { return f.fontName; });\n    var pick = ['Regular', 'Normal', 'Book', 'Buch', 'Roman'].map(function (s) { return mine.find(function (f) { return f.style === s; }); }).find(Boolean) || mine[0];\n    if (pick) { await figma.loadFontAsync(pick); return pick; }\n  }\n  var inter = { family: 'Inter', style: 'Regular' };\n  await figma.loadFontAsync(inter);\n  return inter;\n}\n\nfunction rgb(hex) {\n  var h = hex.replace('#', '');\n  if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');\n  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };\n}\n\nfigma.ui.onmessage = async function (m) {\n  if (!m || m.lp !== 1) return;\n  function reply(ok, error) { figma.ui.postMessage({ lp: 1, id: m.id, ok: ok, error: error }); }\n  try {\n    if (m.op === 'ready') {\n      var saved = await figma.clientStorage.getAsync(KEY);\n      var store = {}; store[KEY] = saved || null;\n      figma.ui.postMessage({ lp: 1, op: 'init', store: store, editor: figma.editorType });\n      return;\n    }\n    if (m.op === 'store') {\n      if (m.key !== KEY) return reply(false, 'Not allowed');\n      if (m.value === null) await figma.clientStorage.deleteAsync(KEY); else await figma.clientStorage.setAsync(KEY, m.value);\n      return reply(true);\n    }\n    if (m.op === 'open') { figma.openExternal(m.url); return reply(true); }\n    if (m.op === 'svg') {\n      var v = figma.createNodeFromSvg(m.svg);\n      v.name = m.name;\n      var s = m.width / (v.width || m.width);\n      v.rescale(s);\n      placeAt(v, v.width, v.height);\n      return reply(true);\n    }\n    if (m.op === 'image') {\n      var img = figma.createImage(m.bytes);\n      var size = await img.getSizeAsync();\n      var w = 600, h = Math.round(600 * (size.height / size.width || 0.75));\n      var r = figma.createRectangle();\n      r.name = m.name; r.resize(w, h);\n      r.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];\n      placeAt(r, w, h);\n      return reply(true);\n    }\n    if (m.op === 'text') {\n      var font = await fontFor(m.font);\n      var t = figma.createText();\n      t.fontName = font; t.characters = m.text; t.fontSize = 24;\n      if (m.text.length > 60) { t.textAutoResize = 'HEIGHT'; t.resize(480, t.height); }\n      placeAt(t, t.width, t.height);\n      return reply(true);\n    }\n    if (m.op === 'fill') {\n      var sel = figma.currentPage.selection.filter(function (n) { return 'fills' in n; });\n      if (!sel.length) return reply(false, 'Select a shape, frame or text first');\n      var paint = { type: 'SOLID', color: rgb(m.hex) };\n      sel.forEach(function (n) { n.fills = [paint]; });\n      return reply(true);\n    }\n    reply(false, 'Figma can\u2019t do that yet');\n  } catch (e) {\n    reply(false, (e && e.message) || String(e));\n  }\n};\n";

export function figmaPlugin(origin: string, slug: string, client: string) {
  const manifest = {
    name: 'Brand panel by Lost Property',
    id: 'lost-property-brand-panel',
    api: '1.0.0',
    main: 'code.js',
    editorType: ['figma', 'figjam'],
    documentAccess: 'dynamic-page',
    networkAccess: {
      allowedDomains: [origin, 'https://*.supabase.co'],
      reasoning: 'The panel is a page on the Lost Property brand platform. It signs in there and loads the brand’s logos and images from the platform’s storage.'
    }
  };
  const code = CODE.replace('__PLATFORM__', JSON.stringify(origin)).replace('__BRAND__', JSON.stringify(slug));
  const readme = [
    `The ${client} brand panel in Figma, by Lost Property`,
    '',
    'To add it (Figma desktop app):',
    '1. Unzip this folder somewhere you’ll keep it.',
    '2. In any Figma file: Menu → Plugins → Development → Import plugin from manifest…, and choose manifest.json in this folder.',
    '3. Run it from Plugins → Development → Brand panel by Lost Property.',
    `4. Sign in with the email you use for the ${client} brand portal, and check the code matches.`,
    '',
    'It places logos as vectors, images, text in the brand’s typeface (if it’s installed) and colours on what you’ve selected.',
    'Keep this folder: Figma runs the plugin from it.',
    ''
  ].join('\n');
  const dir = 'Brand panel by Lost Property/';
  return zipSync({ [dir + 'manifest.json']: strToU8(JSON.stringify(manifest, null, 2)), [dir + 'code.js']: strToU8(code), [dir + 'README.txt']: strToU8(readme) }, { level: 6 });
}
