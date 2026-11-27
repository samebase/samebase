// The schedule of the test broker's cleanup alarm, which needs no Cloudflare runtime. broker.ts wires it
// to the Durable Object; the Node tests import it.

/** The retry delay of the cleanup job: a batch that throws is tried again an hour later. */
export const FALLBACK_MS = 60 * 60 * 1000;
/** The delay to the next batch of a cleanup run that has more to delete. */
export const NEXT_BATCH_MS = 1000;
/** The delay to the next cleanup run: the life of a sign-in request, so expired ones do not pile up. */
export const CLEANUP_EVERY_MS = 10 * 60 * 1000;

/**
 * One delivered alarm's decisions. `stored` is the cutoff of the run in progress, if one is. The
 * batch deletes what ran out before `cutoff`. After it, `store` is the cutoff to keep (undefined:
 * clear it) and `alarmAt` the next alarm. A run keeps one cutoff until a batch reports no `more`,
 * so the run ends. A second delivery of the same alarm repeats a batch, which is safe.
 */
export function alarmPlan(stored: number | undefined, now: number) {
  const cutoff = stored ?? now;
  return {
    cutoff,
    after: (more: boolean) =>
      more
        ? { store: cutoff, alarmAt: now + NEXT_BATCH_MS }
        : { store: undefined, alarmAt: now + CLEANUP_EVERY_MS },
  };
}
