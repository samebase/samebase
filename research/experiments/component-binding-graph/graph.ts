import { z } from "zod";

const reference = z.object({ type: z.literal("envVar"), name: z.string() });

/** The fields observed in the pinned local backend response, not a public Convex API. */
export const mountSchema = z.object({
  definitionPath: z.string(),
  componentPath: z.string(),
  env: z.object({ WORKER_URL: reference, WORKER_SECRET: reference }),
});

export const graphSchema = z.object({
  app: z.object({
    childComponents: z.record(z.string(), mountSchema),
  }),
});
