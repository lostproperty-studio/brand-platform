import { adminClient } from '@/lib/supabase/server';
import { portalContext } from '@/lib/portal/context';
import { signFontUrls } from '@/lib/projects/fonts';
import { Canvas } from '@/components/portal/Canvas';

const LABELS: Record<string, string> = { 'social-post-4x5': 'Instagram post 4:5', 'social-story-9x16': 'Story 9:16', 'social-landscape-1-91x1': 'LinkedIn / X post', 'poster-a3': 'Poster A3', 'signage-panel': 'Signage panel', 'brochure-spread-a4': 'Brochure spread', 'web-hero': 'Web hero', 'email-header': 'Email header', 'slide-16x9': 'Slide 16:9' };

// Canvas: make layouts from the kit's templates. Logo, grid and type are locked; copy and image are the slots.
export default async function CanvasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = (await portalContext(slug))!;
  const sb = adminClient();
  // Templates and the files they reference (tokens, logos, imagery), signed for this session
  const used = ctx.files.filter((f) => f.storage_path && /^(templates|tokens|assets\/(logo|imagery|patterns?))\//.test(f.path));
  const { data } = used.length ? await sb.storage.from('kits').createSignedUrls(used.map((f) => f.storage_path!), 6 * 3600) : { data: [] };
  const byStorage = Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  const resources = Object.fromEntries(used.filter((f) => byStorage[f.storage_path!]).map((f) => [f.path, byStorage[f.storage_path!]]));
  const templates = used.filter((f) => /^templates\/[^/]+\/index\.html$/.test(f.path)).map((f) => { const id = f.path.split('/')[1]; return { id, label: LABELS[id] || id, path: f.path }; });
  const images = used.filter((f) => /^assets\/(imagery|patterns?)\/.+\.(png|jpe?g|webp)$/i.test(f.path)).map((f) => ({ path: f.path, url: resources[f.path] }));
  const fontUrls = await signFontUrls(ctx.fonts, 6 * 3600);
  const fontFiles = ctx.fonts.flatMap((f) => f.files.filter((x) => fontUrls[x.path]).map((x) => ({ role: f.role, name: f.name, weight: x.weight, style: x.style, format: x.format, url: fontUrls[x.path] })));
  const aiConnected = !!ctx.project.ai_key_hint;
  return (
    <div className="pt-page wide">
      <header className="pt-chhead">
        <p className="mute">Make something</p>
        <h1 className="pt-display">Canvas</h1>
        <p className="pt-lede">Pick a format, write your copy, add an image. The logo, grid and type stay exactly as the guidelines say.</p>
      </header>
      {templates.length ? <Canvas slug={slug} templates={templates} resources={resources} images={images} fontFiles={fontFiles} aiConnected={aiConnected} canConnect={ctx.access.clientAdmin} /> : <p className="mute">Templates appear here once the kit is built.</p>}
    </div>
  );
}
