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
