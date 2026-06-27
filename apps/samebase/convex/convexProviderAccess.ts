import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { requestConvexManagementApi } from "./convexManagementApi/client";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import { toErrorMessage } from "./jsonUtils";

const { array, boolean, literal, number, object, optional, string, union } = v;

const vConvexProviderAuthMethod = union(literal("api_key"), literal("oauth"));

const vConvexAccessCheckKey = union(literal("token"), literal("projects"), literal("deployments"));

const vConvexAccessCheckStatus = union(literal("ok"), literal("error"), literal("unknown"));

const vConvexRequestedAccess = object({
  key: string(),
  label: string(),
});

const vConvexTokenDetails = object({
  type: union(literal("team_token"), literal("project_token")),
  id: string(),
  name: string(),
  createdAt: number(),
  teamId: optional(string()),
  projectId: optional(string()),
});

const vConvexTeamAccess = object({
  teamId: string(),
  teamSlug: optional(string()),
});

const vConvexAccessCheck = object({
  key: vConvexAccessCheckKey,
  label: string(),
  status: vConvexAccessCheckStatus,
  message: string(),
});

export const vConvexConnectionAccess = object({
  connected: boolean(),
  authMethod: optional(vConvexProviderAuthMethod),
  checkedAt: number(),
  requestedAccess: array(vConvexRequestedAccess),
  token: optional(vConvexTokenDetails),
  team: optional(vConvexTeamAccess),
  checks: array(vConvexAccessCheck),
});

type ConvexAccessCheck = Infer<typeof vConvexAccessCheck>;
type ConvexAccessCheckKey = Infer<typeof vConvexAccessCheckKey>;
type ConvexConnectionAccess = Infer<typeof vConvexConnectionAccess>;
type ConvexTokenDetails = Infer<typeof vConvexTokenDetails>;

type ConvexProbeResult<Value> =
  | {
      state: "ok";
      value: Value;
      check: ConvexAccessCheck;
    }
  | {
      state: "error";
      check: ConvexAccessCheck;
    };

export const checkConvexConnectionAccess = action({
  access: "access_provider_connections",
  args: {},
  returns: vConvexConnectionAccess,
  handler: async (ctx): Promise<ConvexConnectionAccess> => {
    const checkedAt = Date.now();
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "convex",
    });

    if (connection?.kind !== "convex") {
      return {
        connected: false,
        checkedAt,
        requestedAccess: [],
        checks: [
          {
            key: "token",
            label: "Credential",
            status: "unknown",
            message: "Convex is not connected.",
          },
        ],
      };
    }

    const token = connection.auth.credential.trim();
    const teamId = connection.teamId.trim();
    const checks: ConvexAccessCheck[] = [];
    let tokenDetails: ConvexTokenDetails | undefined;

    const tokenProbe = await runConvexProbe({
      key: "token",
      label: "Token details",
      run: async () => {
        return await readConvexTokenDetails(token);
      },
      describe: (details) => {
        if (details.type === "project_token") {
          return "Probe GET /token_details returned a project-scoped token. Samebase requires team-scoped Convex access.";
        }
        if (details.teamId !== teamId) {
          return "Probe GET /token_details returned a different team than the stored Convex connection. Reauthorize Convex.";
        }
        return `Probe GET /token_details returned team token ${details.name}.`;
      },
    });
    checks.push({
      ...tokenProbe.check,
      status:
        tokenProbe.state === "ok" &&
        (tokenProbe.value.type !== "team_token" || tokenProbe.value.teamId !== teamId)
          ? "error"
          : tokenProbe.check.status,
    });
    if (tokenProbe.state === "ok") {
      tokenDetails = tokenProbe.value;
    }

    const [projectsProbe, deploymentsProbe] = await Promise.all([
      runConvexProbe({
        key: "projects",
        label: "Projects",
        run: async () => {
          return await requestConvexManagementApi(token, "GET", "/teams/{team_id}/list_projects", {
            params: { path: { team_id: teamId } },
          });
        },
        describe: (projects) => {
          if (projects.length === 0) {
            return "Probe GET /teams/{team_id}/list_projects succeeded and returned no visible projects.";
          }
          if (projects.length === 1) {
            return `Probe GET /teams/{team_id}/list_projects returned 1 visible project: ${projects[0].name}.`;
          }
          return `Probe GET /teams/{team_id}/list_projects returned ${projects.length} visible projects.`;
        },
      }),
      runConvexProbe({
        key: "deployments",
        label: "Deployments",
        run: async () => {
          return await requestConvexManagementApi(
            token,
            "GET",
            "/teams/{team_id}/list_deployments",
            {
              params: { path: { team_id: teamId }, query: { limit: 100 } },
            },
          );
        },
        describe: (deployments) => {
          if (deployments.items.length === 0) {
            return "Probe GET /teams/{team_id}/list_deployments succeeded and returned no visible deployments.";
          }
          if (deployments.items.length === 1) {
            return `Probe GET /teams/{team_id}/list_deployments returned 1 visible deployment: ${deployments.items[0].name}.`;
          }
          return `Probe GET /teams/{team_id}/list_deployments returned ${deployments.items.length} visible deployments.`;
        },
      }),
    ]);
    checks.push(projectsProbe.check, deploymentsProbe.check);

    return {
      connected: true,
      authMethod: connection.auth.method,
      checkedAt,
      requestedAccess: [
        {
          key: "team",
          label: "Team-scoped Convex Management API access",
        },
      ],
      token: tokenDetails,
      team: {
        teamId,
        ...(connection.teamSlug ? { teamSlug: connection.teamSlug } : {}),
      },
      checks,
    };
  },
});

async function runConvexProbe<Value>({
  key,
  label,
  run,
  describe,
}: {
  key: ConvexAccessCheckKey;
  label: string;
  run: () => Promise<Value>;
  describe: (value: Value) => string;
}): Promise<ConvexProbeResult<Value>> {
  try {
    const value = await run();
    return {
      state: "ok",
      value,
      check: {
        key,
        label,
        status: "ok",
        message: describe(value),
      },
    };
  } catch (error) {
    return {
      state: "error",
      check: {
        key,
        label,
        status: "error",
        message: formatConvexAccessProbeError(error),
      },
    };
  }
}

async function readConvexTokenDetails(token: string): Promise<ConvexTokenDetails> {
  const details = await requestConvexManagementApi(token, "GET", "/token_details");
  if (details.type === "teamToken") {
    return {
      type: "team_token",
      id: details.id,
      name: details.name,
      createdAt: details.createTime,
      teamId: details.teamId,
    };
  }

  return {
    type: "project_token",
    id: details.id,
    name: details.name,
    createdAt: details.createTime,
    projectId: details.projectId,
  };
}

function formatConvexAccessProbeError(error: unknown): string {
  if (error instanceof ConvexManagementApiError) {
    if (error.status === 401 || error.status === 403) {
      return `Convex denied probe ${error.path} (${error.status}). Reauthorize Convex or update the token.`;
    }
    return `Convex probe ${error.path} failed (${error.status}).`;
  }
  return toErrorMessage(error);
}
