// Background turn analyses still running, per session, so the report can wait for them.
const globalForPending = globalThis as unknown as { pendingAnalyses?: Map<number, Set<Promise<void>>> };
const pending = (globalForPending.pendingAnalyses ??= new Map());

export function track(sessionId: number, work: Promise<void>): void {
  const set = pending.get(sessionId) ?? new Set<Promise<void>>();
  pending.set(sessionId, set);
  set.add(work);
  work.finally(() => set.delete(work));
}

export async function settle(sessionId: number): Promise<void> {
  await Promise.allSettled([...(pending.get(sessionId) ?? [])]);
}
