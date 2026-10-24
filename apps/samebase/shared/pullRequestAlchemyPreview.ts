import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import type { PullRequestAlchemyPreview } from "../convex/repository/pullRequestModel";
import { placeStageResources } from "./alchemyState";
import type { AlchemyStack } from "./alchemyStateModel";

export type PullRequestAlchemyStackRead =
  | { state: "found"; stacks: AlchemyStack[] }
  | { state: "missing" }
  | { state: "failed" };

const vStageOutputUrl = v.object({ url: v.string() });

/** Each `pr-<number>` stage places its resources below the directory of its stack file. */
export function buildPullRequestAlchemyPreview(args: {
  stack: PullRequestAlchemyStackRead;
  head: { headRefOid: string; number: number };
}): PullRequestAlchemyPreview {
  if (args.stack.state === "failed") return { state: "unavailable" };
  const stages =
    args.stack.state === "found"
      ? args.stack.stacks.flatMap((stack) =>
          stack.stages.filter((candidate) => candidate.name === `pr-${args.head.number}`),
        )
      : [];
  if (stages.length === 0) return { state: "absent" };

  const placed = stages.map((stage) => {
    const output: unknown = JSON.parse(stage.output);
    return {
      ...placeStageResources({ stackFile: stage.record.stackFile, resources: stage.resources }),
      url: validate(vStageOutputUrl, output, { allowUnknownFields: true }) ? output.url : null,
      headCommit:
        stage.deployedHeadCommit === args.head.headRefOid &&
        stage.record.headCommit === stage.deployedHeadCommit
          ? args.head.headRefOid
          : null,
    };
  });
  return {
    state: "available",
    convexDeployments: placed.flatMap((stage) =>
      stage.convexDeployments.map(({ state, rootDirectory }) => ({
        name: state.attr.name,
        href: stage.url ?? state.attr.url,
        rootDirectory,
        headCommit: stage.headCommit,
      })),
    ),
    workers: placed.flatMap((stage) =>
      stage.workers.map(({ state, rootDirectory }) => ({
        name: state.attr.workerName,
        url: state.attr.url ?? null,
        rootDirectory,
        headCommit: stage.headCommit,
      })),
    ),
  };
}
