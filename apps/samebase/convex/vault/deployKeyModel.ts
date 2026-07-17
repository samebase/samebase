import { v, type Infer } from "convex/values";

const { literal, object, string, union } = v;

export const vConvexDeployKeyNotCreated = object({
  state: literal("not_created"),
});

export const vConvexProductionDeployKeyCreated = object({
  state: literal("created"),
  name: string(),
  deploymentName: string(),
});

export const vConvexPreviewDeployKeyCreated = object({
  state: literal("created"),
  name: string(),
  projectId: string(),
});

export const vConvexProductionDeployKeyState = union(
  vConvexDeployKeyNotCreated,
  vConvexProductionDeployKeyCreated,
);
export type ConvexProductionDeployKeyState = Infer<typeof vConvexProductionDeployKeyState>;

export const vConvexPreviewDeployKeyState = union(
  vConvexDeployKeyNotCreated,
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
