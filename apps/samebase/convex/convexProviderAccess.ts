import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import {
  listConvexManagementProjects,
  requestConvexManagementApiOrThrow,
} from "./convexManagementApi/client";

const { array, boolean, id, literal, object, optional, string, union } = v;

const vConvexAccessCheckKey = union(literal("token"), literal("projects"), literal("deployments"));

const vConvexAccessCheckStatus = union(literal("ok"), literal("error"), literal("not_run"));

const vConvexTeamAccess = object({
  teamSlug: string(),
});

const vConvexAccessCheck = object({
  key: vConvexAccessCheckKey,
  status: vConvexAccessCheckStatus,
});

export const vConvexConnectionAccess = object({
  connected: boolean(),
  team: optional(vConvexTeamAccess),
  checks: array(vConvexAccessCheck),
});

type ConvexAccessCheck = Infer<typeof vConvexAccessCheck>;
type ConvexAccessCheckKey = Infer<typeof vConvexAccessCheckKey>;
type ConvexConnectionAccess = Infer<typeof vConvexConnectionAccess>;
type ConvexTokenIdentity = { type: "team_token"; teamId: string } | { type: "project_token" };

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
  args: {
    organizationId: id("organizations"),
  },
  returns: vConvexConnectionAccess,
  handler: async (ctx, args): Promise<ConvexConnectionAccess> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForMember,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForProviderStatus,
      { organizationId, userId: ctx.viewer.userId },
    );

    if (configuration.convexTeam === undefined || configuration.convexCredential === undefined) {
      return {
        connected: false,
        checks: [
          {
            key: "token",
            status: "not_run",
          },
        ],
      };
    }

    const token = configuration.convexCredential.auth.credential.trim();
    const teamId = configuration.convexTeam.teamId.trim();
    const checks: ConvexAccessCheck[] = [];

    const tokenProbe = await runConvexProbe({
      key: "token",
      run: async () => {
        return await readConvexTokenDetails(token);
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

    const [projectsProbe, deploymentsProbe] = await Promise.all([
      runConvexProbe({
        key: "projects",
        run: async () => {
          return await listConvexManagementProjects({ token, teamId });
        },
      }),
      runConvexProbe({
        key: "deployments",
        run: async () => {
          return await requestConvexManagementApiOrThrow(
            token,
            "GET",
            "/teams/{team_id}/list_deployments",
            {
              params: { path: { team_id: teamId }, query: { limit: 100 } },
            },
          );
        },
      }),
    ]);
    checks.push(projectsProbe.check, deploymentsProbe.check);

    const firstProject = projectsProbe.state === "ok" ? projectsProbe.value[0] : undefined;
    const firstProjectTeamSlug = firstProject?.teamSlug.trim();
    const observedTeamSlug =
      firstProjectTeamSlug &&
      projectsProbe.state === "ok" &&
      projectsProbe.value.every(
        (project) => project.teamId === teamId && project.teamSlug.trim() === firstProjectTeamSlug,
      )
        ? firstProjectTeamSlug
        : undefined;
    const teamSlug = observedTeamSlug ?? configuration.convexTeam.teamSlug;

    return {
      connected: true,
      ...(teamSlug ? { team: { teamSlug } } : {}),
      checks,
    };
  },
});

async function runConvexProbe<Value>({
  key,
  run,
}: {
  key: ConvexAccessCheckKey;
  run: () => Promise<Value>;
}): Promise<ConvexProbeResult<Value>> {
  try {
    const value = await run();
    return {
      state: "ok",
      value,
      check: {
        key,
        status: "ok",
      },
    };
  } catch (error) {
    console.warn("convex:provider_access_probe_failed", {
      check: key,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return {
      state: "error",
      check: {
        key,
        status: "error",
      },
    };
  }
}

async function readConvexTokenDetails(token: string): Promise<ConvexTokenIdentity> {
  const details = await requestConvexManagementApiOrThrow(token, "GET", "/token_details");
  if (details.type === "teamToken") {
    return {
      type: "team_token",
      teamId: details.teamId,
    };
  }

  return {
    type: "project_token",
  };
}
