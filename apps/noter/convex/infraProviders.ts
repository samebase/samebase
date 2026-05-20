import createClient from "openapi-fetch";
import type { components, paths } from "./convexManagementApi.generated";

export type ConvexManagementProject =
  components["schemas"]["PlatformProjectDetails"];
export type ConvexManagementDeployment =
  components["schemas"]["PlatformDeploymentResponse"];
export type ConvexManagementCreateProjectResponse =
  components["schemas"]["PlatformCreateProjectResponse"];
export type ConvexManagementCreateDeployKeyResponse =
  components["schemas"]["PlatformCreateDeployKeyResponse"];
export type ConvexManagementTokenDetails =
  components["schemas"]["PlatformTokenDetailsResponse"];
type ConvexManagementDeploymentType =
  components["schemas"]["CreateDeploymentType"];

export interface ConvexManagementProvider {
  listProjects(args: { teamId: string }): Promise<ConvexManagementProject[]>;
  createProject(args: {
    teamId: string;
    projectName: string;
    deploymentType: ConvexManagementDeploymentType;
  }): Promise<ConvexManagementCreateProjectResponse>;
  listDeployments(args: {
    projectId: string;
    deploymentType?: components["schemas"]["DeploymentType"];
    includeLocal?: boolean;
    isDefault?: boolean | null;
  }): Promise<ConvexManagementDeployment[]>;
  createDeployment(args: {
    projectId: string;
    type: ConvexManagementDeploymentType;
  }): Promise<ConvexManagementDeployment>;
  getDeployment(args: {
    deploymentName: string;
  }): Promise<ConvexManagementDeployment>;
  createDeployKey(args: {
    deploymentName: string;
    name: string;
  }): Promise<ConvexManagementCreateDeployKeyResponse>;
  deleteProject(args: { projectId: string }): Promise<void>;
  deleteDeployment(args: { deploymentName: string }): Promise<void>;
  getTokenDetails(): Promise<ConvexManagementTokenDetails>;
}

export class ConvexManagementApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly payload: unknown;

  constructor(args: { status: number; path: string; payload: unknown }) {
    super(
      `Convex API request failed (${args.status}) for ${args.path}: ${payloadToString(args.payload)}`,
    );
    this.name = "ConvexManagementApiError";
    this.status = args.status;
    this.path = args.path;
    this.payload = args.payload;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function payloadToString(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    const serialized = JSON.stringify(payload);
    if (typeof serialized === "string") {
      return serialized;
    }
    return String(payload);
  } catch {
    return String(payload);
  }
}

function parseConvexManagementIntegerId(value: string, field: string): number {
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    throw new Error(`Convex ${field} must be a numeric ID.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Convex ${field} is outside the safe integer range.`);
  }
  return parsed;
}

export function formatConvexManagementIntegerId(
  value: number,
  field: string,
): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Convex ${field} is outside the safe integer range.`);
  }
  return String(value);
}

export function readConvexTeamTokenDetails(
  details: ConvexManagementTokenDetails,
): { teamId: string; teamSlug?: string } | null {
  if (details.type === "teamToken") {
    return {
      teamId: formatConvexManagementIntegerId(details.teamId, "team ID"),
    };
  }
  return null;
}

function createAuthedClient(token: string) {
  return createClient<paths>({
    baseUrl: "https://api.convex.dev/v1",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function throwConvexManagementError(args: {
  response: Response;
  path: string;
  payload: unknown;
}): Promise<never> {
  if (!args.response.ok) {
    throw new ConvexManagementApiError({
      status: args.response.status,
      path: args.path,
      payload: args.payload,
    });
  }
  throw new ConvexManagementApiError({
    status: args.response.status,
    path: args.path,
    payload: "Convex Management API response was missing its expected body.",
  });
}

function requireConvexManagementData<T>(args: {
  data: T | undefined;
  response: Response;
  path: string;
}): T {
  if (args.data === undefined) {
    throw new ConvexManagementApiError({
      status: args.response.status,
      path: args.path,
      payload: "Convex Management API response was missing its expected body.",
    });
  }
  return args.data;
}

export function createInfraProviders(args?: { convexToken?: string }): {
  convex: ConvexManagementProvider;
} {
  const convexTokenOverride = args?.convexToken;
  const getClient = () => {
    if (!convexTokenOverride) {
      throw new Error("Convex access token is required.");
    }
    return createAuthedClient(convexTokenOverride);
  };

  return {
    convex: {
      async listProjects({ teamId }) {
        const path = `/teams/${encodeURIComponent(teamId)}/list_projects`;
        const { data, error, response } = await getClient().GET(
          "/teams/{team_id}/list_projects",
          {
            params: {
              path: {
                team_id: parseConvexManagementIntegerId(teamId, "team ID"),
              },
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async createProject({ teamId, projectName, deploymentType }) {
        const path = `/teams/${encodeURIComponent(teamId)}/create_project`;
        const { data, error, response } = await getClient().POST(
          "/teams/{team_id}/create_project",
          {
            params: {
              path: {
                team_id: parseConvexManagementIntegerId(teamId, "team ID"),
              },
            },
            body: {
              projectName,
              deploymentType,
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async listDeployments({
        projectId,
        deploymentType,
        includeLocal,
        isDefault,
      }) {
        const path = `/projects/${encodeURIComponent(projectId)}/list_deployments`;
        const { data, error, response } = await getClient().GET(
          "/projects/{project_id}/list_deployments",
          {
            params: {
              path: {
                project_id: parseConvexManagementIntegerId(
                  projectId,
                  "project ID",
                ),
              },
              query: {
                deploymentType,
                includeLocal,
                isDefault,
              },
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async createDeployment({ projectId, type }) {
        const path = `/projects/${encodeURIComponent(projectId)}/create_deployment`;
        const { data, error, response } = await getClient().POST(
          "/projects/{project_id}/create_deployment",
          {
            params: {
              path: {
                project_id: parseConvexManagementIntegerId(
                  projectId,
                  "project ID",
                ),
              },
            },
            body: {
              type,
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async getDeployment({ deploymentName }) {
        const path = `/deployments/${encodeURIComponent(deploymentName)}`;
        const { data, error, response } = await getClient().GET(
          "/deployments/{deployment_name}",
          {
            params: {
              path: {
                deployment_name: deploymentName,
              },
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async createDeployKey({ deploymentName, name }) {
        const path = `/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`;
        const { data, error, response } = await getClient().POST(
          "/deployments/{deployment_name}/create_deploy_key",
          {
            params: {
              path: {
                deployment_name: deploymentName,
              },
            },
            body: {
              name,
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
      async deleteProject({ projectId }) {
        const path = `/projects/${encodeURIComponent(projectId)}/delete`;
        const { error, response } = await getClient().POST(
          "/projects/{project_id}/delete",
          {
            params: {
              path: {
                project_id: parseConvexManagementIntegerId(
                  projectId,
                  "project ID",
                ),
              },
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
      },
      async deleteDeployment({ deploymentName }) {
        const path = `/deployments/${encodeURIComponent(deploymentName)}/delete`;
        const { error, response } = await getClient().POST(
          "/deployments/{deployment_name}/delete",
          {
            params: {
              path: {
                deployment_name: deploymentName,
              },
            },
          },
        );
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
      },
      async getTokenDetails() {
        const path = "/token_details";
        const { data, error, response } =
          await getClient().GET("/token_details");
        if (!response.ok) {
          await throwConvexManagementError({ response, path, payload: error });
        }
        return requireConvexManagementData({ data, response, path });
      },
    },
  };
}
