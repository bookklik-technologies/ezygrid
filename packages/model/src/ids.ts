let counter = 0;

/** Generate a stable unique id for rows/columns/sheets/etc. */
export function createId(prefix = 'id'): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}
