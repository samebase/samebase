import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, object, string } = v;

export const vConvexProjectResult = object({
  projectId: string(),
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
});

export const convexListProjectsContract = {
  id: "list_convex_projects",
  access: ACCESS_APP_CREATE,
  args: {},
  returns: array(vConvexProjectResult),
  structuredContent: object({ projects: array(vConvexProjectResult) }),
  mcp: {
    title: "List Convex projects",
    name: "vault_convex_listProjects",
    description:
      "List the Convex projects available on the caller's connected Convex account, for choosing an attach target.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Discovery read for the manual Convex attach flow: returns the projects on the caller's
connected Convex account (id, name, slug, team slug). Use it to pick the \`projectId\` argument for
\`connect_convex_project\`. Requires a Convex provider connection; reads from Convex's API and
writes nothing.`,
} as const;
