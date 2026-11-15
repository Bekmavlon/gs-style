import { __setDb, LibosimDB } from '@/lib/db';
import { __resetOwnerCache } from '@/lib/repo';

export async function freshDb(name = 'test-' + Math.random().toString(36).slice(2)) {
  const d = new LibosimDB(name);
  await d.open();
  __setDb(d);
  __resetOwnerCache();
  return d;
}
export function useDevice(d: LibosimDB) {
  __setDb(d);
  __resetOwnerCache();
}
