import { describe, expect, it } from "vite-plus/test";
import { v } from "convex/values";

import { convexArgsToToolInputSchema, convexValidatorToToolOutputSchema } from "./convexSchemas";

describe("convexArgsToToolInputSchema", () => {
  it("converts Convex args into an MCP input schema", () => {
    const inputSchema = convexArgsToToolInputSchema(
      {
        name: v.string(),
        private: v.optional(v.boolean()),
        visibility: v.union(v.literal("public"), v.literal("private")),
        labels: v.array(v.string()),
        settings: v.object({
          retries: v.number(),
          note: v.optional(v.string()),
        }),
      },
      {
        name: "App name.",
        private: "Whether the app is private.",
        visibility: "Repository visibility.",
        labels: "Labels to apply.",
        settings: "Provisioning settings.",
      },
    );

    expect(inputSchema).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "App name.",
        },
        private: {
          type: "boolean",
          description: "Whether the app is private.",
        },
        visibility: {
          anyOf: [{ const: "public" }, { const: "private" }],
          description: "Repository visibility.",
        },
        labels: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Labels to apply.",
        },
        settings: {
          type: "object",
          properties: {
            retries: {
              type: "number",
            },
            note: {
              type: "string",
            },
          },
          required: ["retries"],
          additionalProperties: false,
          description: "Provisioning settings.",
        },
      },
      required: ["name", "visibility", "labels", "settings"],
      additionalProperties: false,
    });
  });
});

describe("convexValidatorToToolOutputSchema", () => {
  it("converts structured content into an MCP output schema", () => {
    expect(
      convexValidatorToToolOutputSchema(
        v.object({
          app: v.object({
            id: v.id("repositories"),
            state: v.union(v.literal("ready"), v.literal("failed")),
          }),
          nextAction: v.optional(v.string()),
        }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        app: {
          type: "object",
          properties: {
            id: { type: "string" },
            state: {
              anyOf: [{ const: "ready" }, { const: "failed" }],
            },
          },
          required: ["id", "state"],
          additionalProperties: false,
        },
        nextAction: { type: "string" },
      },
      required: ["app"],
      additionalProperties: false,
    });
  });
});
