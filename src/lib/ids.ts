/**
 * Local-only identifiers. There is no server to coordinate with and one user
 * per install, so a short random suffix is collision-proof enough; the prefix
 * exists purely to make stored JSON readable when you open a backup by hand.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
