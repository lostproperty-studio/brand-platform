// A comment the studio left on the portal preview
export type PortalComment = {
  id: string; path: string; chapter: string | null; block: string | null; x: number; y: number; body: string;
  author: string | null; author_name: string; replies: { body: string; author_name: string; at: string }[];
  resolved_at: string | null; resolved_by: string | null; created_at: string;
};
export const when = (iso: string) => {
  const d = new Date(iso), now = new Date(); const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins} min ago`;
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return `yesterday ${t}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + t;
};
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
