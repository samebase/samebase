import { Workpool } from "@convex-dev/workpool";

import { components } from "./_generated/api";

/**
 * GitHub observation jobs share one bounded worker pool. The account rate
 * budget independently serializes requests that use the same GitHub account.
 */
export const githubObservationWorkpool = new Workpool(components.githubObservationWorkpool, {
  maxParallelism: 3,
  retryActionsByDefault: false,
});
