# @samebase/handlers

Define a Convex handler contract once, then use its validators for the app function and project the
same contract into MCP tool metadata and JSON Schema.

The package owns contract and schema mechanics. The app owns handlers, authorization, OAuth, HTTP
routes, and product data.

```ts
import { defineHandlerContract, projectHandlerMcpTool } from "@samebase/handlers";
import { v } from "convex/values";

const result = v.object({ productId: v.id("products") });

export const createProductContract = defineHandlerContract({
  id: "create_product",
  access: "authenticated",
  args: { url: v.string() },
  returns: result,
  structuredContent: result,
  mcp: {
    title: "Create product",
    name: "products_create",
    description: "Create or return a product.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: { url: "Product URL or domain." },
  },
  doc: "Creates a product when its canonical domain does not exist.",
});

projectHandlerMcpTool(createProductContract);
```

## Development

Use pnpm's `link:` protocol when a second local app needs the package during development. Keep both
projects on the same exact Convex version, and rebuild this package after a public API change. Do
not commit a machine-specific link in the app that consumes the package.

`pnpm --filter @samebase/handlers check` builds a real npm archive, installs it in an isolated
consumer, checks its types, and runs it. Use that archive check before a release. Normal local edits
do not need an archive.
