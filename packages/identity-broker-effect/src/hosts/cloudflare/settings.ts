// The test hub's decisions that need no Cloudflare runtime: its policy and the cleanup alarm's
// schedule. hub.ts wires them to the Worker and the Durable Object; the Node tests import them.
import { Schema } from "effect";
import type { PolicyFunction } from "../../core/policy.ts";

/** `ALLOWED_REPOSITORIES`: GitHub's numeric repository id and owner id pairs, as JSON. */
export const AllowedRepositories = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ repositoryId: Schema.String, ownerId: Schema.String })),
);

/**
 * A repository of the list gets both connectors, every other repository gets none, and nothing is
 * paused. The owner id is checked with the repository id: a transferred repository keeps its id.
 */
export function allowListPolicy(allowed: typeof AllowedRepositories.Type): PolicyFunction {
  return (registration) => {
    const listed = allowed.some(
      (entry) =>
        entry.repositoryId === registration.repositoryId && entry.ownerId === registration.ownerId,
    );
    return { connectors: listed ? ["google", "github"] : [], resources: [], paused: false };
  };
}

/** Each delivered alarm first arms this one, so a batch that throws is tried again an hour later. */
export const FALLBACK_MS = 60 * 60 * 1000;
/** The delay to the next batch of a cleanup run that has more to delete. */
export const NEXT_BATCH_MS = 1000;

/** The next daily cleanup, at 04:17 UTC as the Convex hub's cron, strictly after `now`. */
export function nextDailyAt(now: number): number {
  const day = new Date(now);
  const today = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 4, 17);
  return today > now ? today : today + 24 * 60 * 60 * 1000;
}

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
        : { store: undefined, alarmAt: nextDailyAt(now) },
  };
}
