import { v, type Infer } from "convex/values";

const { id, literal, object, string, union } = v;

export const vConvexDeployKeyNotCreated = object({
  state: literal("not_created"),
});

export const vConvexProductionDeployKeyCreating = object({
  state: literal("creating"),
  runId: id("appProvisioningRuns"),
  teamId: string(),
  name: string(),
  deploymentName: string(),
});

export const vConvexProductionDeployKeyCreated = object({
  state: literal("created"),
  teamId: string(),
  name: string(),
  deploymentName: string(),
});

export const vConvexPreviewDeployKeyCreating = object({
  state: literal("creating"),
  runId: id("appProvisioningRuns"),
  teamId: string(),
  name: string(),
  projectId: string(),
});

export const vConvexPreviewDeployKeyCreated = object({
  state: literal("created"),
  teamId: string(),
  name: string(),
  projectId: string(),
});

export const vConvexProductionDeployKeyState = union(
  vConvexDeployKeyNotCreated,
  vConvexProductionDeployKeyCreating,
  vConvexProductionDeployKeyCreated,
);
export type ConvexProductionDeployKeyState = Infer<typeof vConvexProductionDeployKeyState>;

export const vConvexPreviewDeployKeyState = union(
  vConvexDeployKeyNotCreated,
  vConvexPreviewDeployKeyCreating,
  vConvexPreviewDeployKeyCreated,
);
export type ConvexPreviewDeployKeyState = Infer<typeof vConvexPreviewDeployKeyState>;

export const vConvexDeployKeys = object({
  production: vConvexProductionDeployKeyState,
  preview: vConvexPreviewDeployKeyState,
});
export type ConvexDeployKeys = Infer<typeof vConvexDeployKeys>;

export const vCreatedConvexDeployKeys = object({
  production: vConvexProductionDeployKeyCreated,
  preview: vConvexPreviewDeployKeyCreated,
});
