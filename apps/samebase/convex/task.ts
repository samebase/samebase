/// <reference lib="es2021.promise" />
import { AbortError, createRun, type Result, type Task } from "@evolu/common";

/** Runs a Task within one action invocation and reports defects only after cleanup. */
export async function runTask<T, E>(task: Task<T, E>): Promise<Result<T, E>> {
  const defects = new Set<unknown>();
  const reportDefect = (reported: unknown): void => {
    defects.add(
      AbortError.is(reported) && reported.reason.type === "PanicAbortReason"
        ? reported.reason["defect"]
        : reported,
    );
  };
  const run = createRun({ reportDefect });
  const outcome = Promise.resolve().then(() => run(task));

  // Retain the outcome while collecting failures from both execution and cleanup.
  await outcome.catch(reportDefect);
  await Promise.resolve(run[Symbol.asyncDispose]()).catch(reportDefect);

  if (defects.size > 1) {
    throw new AggregateError(defects, "Multiple Task failures occurred during the action.");
  }
  if (defects.size === 1) {
    throw defects.values().next().value;
  }
  return outcome;
}
