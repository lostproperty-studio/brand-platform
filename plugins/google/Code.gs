/**
 * The Lost Property brand panel, as a Google Workspace Editor add-on for Docs, Slides and Sheets.
 * The sidebar shows the panel from the brand platform; this script does what the panel asks in the open file:
 * place a picture, add text. People sign in to their own brand portal from the panel.
 *
 * PLATFORM is the brand platform's address. BRAND (optional) is a client's portal address, e.g. "tileyard", for a
 * copy published privately for one client: it chooses their brand at sign-in.
 */
var PLATFORM = 'https://staging.platform.lostproperty.studio';
var BRAND = '';

function onOpen(e) {
  var ui = host_().ui;
  ui.createAddonMenu().addItem('Open the brand panel', 'showPanel').addToUi();
}
function onInstall(e) { onOpen(e); }

function host_() {
  try { return { app: 'docs', ui: DocumentApp.getUi() }; } catch (e) {}
  try { return { app: 'slides', ui: SlidesApp.getUi() }; } catch (e) {}
  return { app: 'sheets', ui: SpreadsheetApp.getUi() };
}

function showPanel() {
  var h = host_();
  var t = HtmlService.createTemplateFromFile('Sidebar');
  t.src = PLATFORM + '/panel/google?app=' + h.app + (BRAND ? '&p=' + encodeURIComponent(BRAND) : '');
  t.platform = PLATFORM;
  h.ui.showSidebar(t.evaluate().setTitle('Brand'));
}

/** A picture from a link (the platform's signed links) or as base64 PNG (logos drawn from SVG in the panel) */
function blob_(req) {
  if (req.b64) return Utilities.newBlob(Utilities.base64Decode(req.b64), 'image/png', (req.name || 'logo') + '.png');
  if (req.url && req.url.indexOf('https://') === 0) return UrlFetchApp.fetch(req.url).getBlob().setName(req.name || 'image');
  throw new Error('No picture to add');
}

function insertImage(req) {
  var h = host_(), b = blob_(req), w = Number(req.width) || 200;
  if (h.app === 'docs') {
    var doc = DocumentApp.getActiveDocument(), cur = doc.getCursor(), img;
    if (cur) img = cur.insertInlineImage(b); else img = doc.getBody().appendImage(b);
    if (img) { var r = img.getHeight() / img.getWidth(); img.setWidth(w).setHeight(Math.round(w * r)); }
    return true;
  }
  if (h.app === 'slides') {
    var pres = SlidesApp.getActivePresentation(), sel = pres.getSelection(), page = sel && sel.getCurrentPage();
    if (!page) page = pres.getSlides()[0];
    var im = page.insertImage(b), ratio = im.getHeight() / im.getWidth();
    im.setWidth(w).setHeight(w * ratio);
    return true;
  }
  var sh = SpreadsheetApp.getActiveSheet(), cell = sh.getActiveCell();
  var over = sh.insertImage(b, cell.getColumn(), cell.getRow());
  var rr = over.getHeight() / over.getWidth(); over.setWidth(w).setHeight(Math.round(w * rr));
  return true;
}

function insertText(req) {
  var h = host_(), text = String(req.text || '');
  if (h.app === 'docs') {
    var doc = DocumentApp.getActiveDocument(), cur = doc.getCursor();
    if (cur && cur.insertText(text)) return true;
    doc.getBody().appendParagraph(text); return true;
  }
  if (h.app === 'slides') {
    var pres = SlidesApp.getActivePresentation(), sel = pres.getSelection(), page = sel && sel.getCurrentPage();
    if (!page) page = pres.getSlides()[0];
    page.insertTextBox(text); return true;
  }
  SpreadsheetApp.getActiveSheet().getActiveCell().setValue(text); return true;
}
