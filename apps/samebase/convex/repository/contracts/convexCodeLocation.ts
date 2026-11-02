import { v } from "convex/values";

const { literal, object, string, union } = v;

export const vConvexCodeLocation = union(
  object({
    kind: literal("config"),
    convexConfigPath: string(),
  }),
  object({
    kind: literal("directory"),
    convexDirectoryPath: string(),
  }),
);
