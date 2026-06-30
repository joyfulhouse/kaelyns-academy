// src/lib/concurrency.ts
/**
 * Run `fn` over `items` with at most `limit` calls in flight at once. Resolves when
 * every item has been processed. Per-item rejections are swallowed so one failure
 * can't reject the whole batch (callers warm fire-and-forget). Used to bound the
 * TTS pre-synth burst so one request can't start hundreds of concurrent synths.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const item = items[index++];
      try {
        await fn(item);
      } catch {
        // best-effort: a single item's failure must not stop the rest
      }
    }
  };
  const workers = Math.max(1, Math.min(Math.trunc(limit), items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

/**
 * Collapse concurrent identical work: if `key` already has an in-flight promise in
 * `map`, return it; otherwise run `factory()`, store its promise under `key`, and
 * clear the slot once it settles (resolve OR reject) so a later call re-runs rather
 * than returning a stale/rejected result. Used to dedupe TTS synths so a burst of
 * identical requests shares one Kokoro call + write instead of stampeding.
 *
 * The settle-time cleanup only deletes the slot when WE still own it (a distinct
 * later task may have replaced us after settling), making it safe against
 * interleaved re-keys. The caller keeps any per-call work (cache checks, writes)
 * outside this helper — only the shared promise is deduped.
 */
export function dedupeInflight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;
  const task = factory();
  map.set(key, task);
  const clear = (): void => {
    if (map.get(key) === task) map.delete(key);
  };
  task.then(clear, clear);
  return task;
}
