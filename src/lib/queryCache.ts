// Minimal in-memory query cache with TTL. The goal is not to replace
// real-time data — it's to make repeat navigation feel instant (Dashboard →
// Invoices → Dashboard no longer blank-loads everything from scratch).
// Keys must be caller-specific (include the user/workspace id). Mutations
// should call invalidate() with a matching prefix so the user never sees
// stale data after they create/delete something.

const store = new Map<string, { ts: number; data: unknown }>();

export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cachedQuery<T>(
  key: string,
  ttlMs: number,
  fetcher: () => PromiseLike<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) {
    return hit.data as T;
  }
  const data = await fetcher();
  store.set(key, { ts: Date.now(), data });
  return data;
}
