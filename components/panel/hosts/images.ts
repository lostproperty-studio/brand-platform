// Getting a picture ready for an app that wants the bytes rather than a link (Office, Google). No imports.

export async function base64Of(url: string): Promise<{ b64: string; type: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Couldn’t fetch the image');
  const blob = await r.blob();
  const data = await new Promise<string>((ok, fail) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = fail; f.readAsDataURL(blob); });
  return { b64: data.slice(data.indexOf(',') + 1), type: blob.type };
}

/** An SVG drawn as a PNG, for apps that can't take SVG. Twice the size it's placed at, so it stays sharp. */
export async function svgToPng(url: string, width = 1200): Promise<{ b64: string; w: number; h: number }> {
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('Couldn’t read the logo')); img.src = url; });
  const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
  const c = document.createElement('canvas'); c.width = width; c.height = Math.max(1, Math.round(width * ratio));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/png');
  return { b64: d.slice(d.indexOf(',') + 1), w: c.width, h: c.height };
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* the app's frame may not allow it */ }
  const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove();
  if (!ok) throw new Error('Couldn’t copy here');
}
