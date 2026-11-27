// Names for uploaded files that keep the folders they came in (Upload a folder), made safe to use in storage paths
// and zip files. No imports, so it can be used on the server, in the browser and in tests.

/** One file or folder name: letters, numbers, dots, dashes and underscores; spaces become dashes */
export const safeSegment = (s: string) => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/^\.+$/, '').slice(0, 120);

/** A file's path inside a package, folders and all (e.g. "Dense/Tileyard_DotGrid_3x2.png"). Empty, "." and ".."
 *  parts are dropped, so it can never point outside the package; at most 6 folders deep. */
export function safeRelPath(name: string): string {
  const parts = String(name).split(/[\\/]+/).map(safeSegment).filter((p) => p && p !== '.' && p !== '..');
  const file = parts.pop() || 'file';
  return [...parts.slice(-6), file].join('/');
}

/** The path to send for a file picked with "Upload a folder": its place inside the chosen folder (the chosen folder
 *  itself is the package, so its own name is left off). Files picked on their own keep just their name. */
export function relativeUploadName(f: { name: string; webkitRelativePath?: string }) {
  const rel = f.webkitRelativePath || '';
  const parts = rel.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join('/') : f.name;
}
