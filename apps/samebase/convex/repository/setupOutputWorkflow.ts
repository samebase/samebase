import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { SetupOutputApplyResult } from "./setupOutputModel";

const workflow = new WorkflowManager(components.workflow);
const { id } = v;

/**
The waits before each read of the first setup output, about 20 minutes in all. The seed push starts
the repository's first alchemy run, which publishes the setup output after its deploy. After the
last read, the output waits for a member's apply, and the setup status shows it.
*/
const FIRST_SETUP_OUTPUT_READ_DELAYS_MS = [
  30_000, 30_000, 60_000, 60_000, 60_000, 120_000, 120_000, 180_000, 180_000, 360_000,
];

/** Whether the observer reads again after this result of the first apply. */
function isFirstSetupOutputSettled(result: SetupOutputApplyResult): boolean {
  switch (result.state) {
    case "no_setup_run":
    case "no_output":
    case "refused":
    case "failed":
      return false;
    case "invalid_output":
    case "unchanged":
    case "needs_member":
    case "applied":
    case "destroy_reported":
      return true;
    default:
      result satisfies never;
      throw new Error("Unknown setup output apply result.");
  }
}

/**
Reads the setup output of a repository_actions repository a bounded number of times after its setup
finishes, and applies the first one when decideFirstSetupOutputApply allows it. It takes no
provider write lock: the apply mutation checks that no other provider operation runs, and a refused
apply is read again on the next pass.
*/
export const observeFirstSetupOutput = workflow.define({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    for (const delayMs of FIRST_SETUP_OUTPUT_READ_DELAYS_MS) {
      const result: SetupOutputApplyResult = await step.runAction(
        internal.repository.setupOutput.applyFirstForCreator,
        { userId: args.userId, repositoryId: args.repositoryId },
        { name: "apply_first_setup_output", runAfter: delayMs, retry: false },
      );
      if (isFirstSetupOutputSettled(result)) {
        return null;
      }
    }
    return null;
  },
});

/** Starts observeFirstSetupOutput, as the last step of a repository_actions setup. */
export const startFirstSetupOutputObserver = internalMutation({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await workflow.start(ctx, internal.repository.setupOutputWorkflow.observeFirstSetupOutput, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    return null;
  },
});
