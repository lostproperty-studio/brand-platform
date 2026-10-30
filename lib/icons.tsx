// App icons for Tools: simple line icons on a 24px grid, drawn for the platform.
export const ICONS: Record<string, string[]> = {
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  layout: ['M4 4h16v16H4z', 'M4 9h16', 'M10 9v11'],
  social: ['M6 3h12v18H6z', 'M6 7h12', 'M9 17h6'],
  poster: ['M5 3h14v18H5z', 'M8 7h8', 'M8 10h5', 'M8 15h8v3H8z'],
  slides: ['M3 5h18v12H3z', 'M8 21h8', 'M12 17v4', 'M7 9h6'],
  doc: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 15h7', 'M9 18h4'],
  image: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M15.5 9.5a1.5 1.5 0 1 0 0-.01'],
  type: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'],
  palette: ['M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.2-1.7-.4-1.1.3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z', 'M7.5 11a1 1 0 1 0 0-.01', 'M10 7a1 1 0 1 0 0-.01', 'M15 7.5a1 1 0 1 0 0-.01'],
  wand: ['M4 20L15 9', 'M14 4v3', 'M18 6h3', 'M17 9l2 2', 'M12.5 6.5l-1-1'],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  shapes: ['M7 4l4 7H3z', 'M14 14h7v7h-7z', 'M17.5 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', 'M4 15a3 3 0 1 0 6 0 3 3 0 0 0-6 0'],
  sign: ['M11 3h2v18h-2', 'M5 6h12l2 2.5L17 11H5z', 'M19 13H7l-2 2.5L7 18h12z'],
  motion: ['M5 4l14 8-14 8z'],
  badge: ['M12 3l2.5 2 3.2-.3.6 3.1 2.7 1.7-1.3 3 1.3 3-2.7 1.7-.6 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.6-3.1L3 14.5l1.3-3L3 8.5l2.7-1.7.6-3.1 3.2.3z'],
  map: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
};
export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const d = ICONS[name] || ICONS.grid;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d.map((p, i) => <path key={i} d={p} />)}</svg>;
}
