import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "advance organization deletion storage rollout",
  { minutes: 5 },
  internal.organizationDeletion.rollout.advanceStorageCleanup,
  {},
);

export default crons;
