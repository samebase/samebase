import { createClient } from "./generated/client/client.gen";
import type { Client } from "./generated/client/types.gen";
import {
  createDeployKey,
  createDeployment,
  createProject,
  deleteDeployment,
  deleteProject,
  getDeploymentInProjectByProjectId,
  getProjectById,
  getTokenDetails,
  listDeployments,
  listProjects,
  platformGetDeployment,
} from "./generated/sdk.gen";
import type {
  CreateDeployKeyResponse,
  CreateDeploymentResponse,
  CreateProjectResponse,
  GetDeploymentInProjectByProjectIdResponse,
  GetProjectByIdResponse,
  GetTokenDetailsResponse,
  ListDeploymentsResponse,
  ListProjectsResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
} from "./generated/types.gen";
import { isRecord, readString, toErrorMessage } from "../jsonUtils";
import { ConvexManagementApiError } from "./errors";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";
const CONVEX_MANAGEMENT_TIMEOUT_MS = 10_000;

type ConvexManagementResult<T> = {
  data?: T;
  error?: unknown;
  response?: Response;
};

type ConvexManagementEndpointArgs = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  url: string;
};

export type ConvexCloudDeployment = Extract<
  PlatformDeploymentResponse,
  { kind: "cloud" }
>;
export type {
  CreateDeployKeyResponse,
  CreateDeploymentResponse,
  CreateProjectResponse,
  GetDeploymentInProjectByProjectIdResponse,
  GetProjectByIdResponse,
  GetTokenDetailsResponse,
  ListDeploymentsResponse,
  ListProjectsResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
};

export function isConvexCloudDeployment(
  deployment: PlatformDeploymentResponse,
): deployment is ConvexCloudDeployment {
  return deployment.kind === "cloud";
}

export function createConvexManagementApi(token: string) {
  const generatedClient = createClient({
    baseUrl: CONVEX_MANAGEMENT_BASE_URL,
    fetch: fetchConvexManagementApi,
    headers: {
      Authorization: `Bearer ${readConvexManagementAccessToken(token)}`,
    },
  });

  return {
    endpoints: {
      deployment: (args: { deploymentName: string }) =>
        formatEndpoint(generatedClient, {
          path: { deployment_name: args.deploymentName },
          url: "/deployments/{deployment_name}",
        }),
      deploymentInProject: (args: {
        defaultDev?: boolean;
        defaultProd?: boolean;
        projectId: string;
      }) =>
        formatEndpoint(generatedClient, {
          path: { project_id: args.projectId },
          query: {
            defaultDev: args.defaultDev,
            defaultProd: args.defaultProd,
          },
          url: "/projects/{project_id}/deployment",
        }),
      listDeployments: (args: { projectId: string }) =>
        formatEndpoint(generatedClient, {
          path: { project_id: args.projectId },
          url: "/projects/{project_id}/list_deployments",
        }),
      listProjects: (args: { teamId: string }) =>
        formatEndpoint(generatedClient, {
          path: { team_id: args.teamId },
          url: "/teams/{team_id}/list_projects",
        }),
    },
    async createDeployKey(args: {
      deploymentName: string;
      name: string;
    }): Promise<CreateDeployKeyResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { deployment_name: args.deploymentName },
        url: "/deployments/{deployment_name}/create_deploy_key",
      });
      return readConvexManagementResult({
        endpoint,
        result: await createDeployKey({
          body: { name: args.name },
          client: generatedClient,
          path: { deployment_name: args.deploymentName },
        }),
        schemaName: "create deploy key response",
      });
    },
    async createDeployment(args: {
      deploymentType: "prod" | "dev";
      projectId: string;
    }): Promise<CreateDeploymentResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { project_id: args.projectId },
        url: "/projects/{project_id}/create_deployment",
      });
      return readConvexManagementResult({
        endpoint,
        result: await createDeployment({
          body: { type: args.deploymentType },
          client: generatedClient,
          path: { project_id: args.projectId },
        }),
        schemaName: "create deployment response",
      });
    },
    async createProject(args: {
      projectName: string;
      teamId: string;
    }): Promise<CreateProjectResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { team_id: args.teamId },
        url: "/teams/{team_id}/create_project",
      });
      return readConvexManagementResult({
        endpoint,
        result: await createProject({
          body: {
            deploymentType: "prod",
            projectName: args.projectName,
          },
          client: generatedClient,
          path: { team_id: args.teamId },
        }),
        schemaName: "create project response",
      });
    },
    async deleteDeployment(args: { deploymentName: string }): Promise<void> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { deployment_name: args.deploymentName },
        url: "/deployments/{deployment_name}/delete",
      });
      readConvexManagementResult({
        endpoint,
        result: await deleteDeployment({
          client: generatedClient,
          path: { deployment_name: args.deploymentName },
        }),
        schemaName: "delete deployment response",
      });
    },
    async deleteProject(args: { projectId: string }): Promise<void> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { project_id: args.projectId },
        url: "/projects/{project_id}/delete",
      });
      readConvexManagementResult({
        endpoint,
        result: await deleteProject({
          client: generatedClient,
          path: { project_id: args.projectId },
        }),
        schemaName: "delete project response",
      });
    },
    async getDeployment(args: {
      deploymentName: string;
    }): Promise<PlatformDeploymentResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { deployment_name: args.deploymentName },
        url: "/deployments/{deployment_name}",
      });
      return readConvexManagementResult({
        endpoint,
        result: await platformGetDeployment({
          client: generatedClient,
          path: { deployment_name: args.deploymentName },
        }),
        schemaName: "get deployment response",
      });
    },
    async getDeploymentInProject(args: {
      defaultDev?: boolean;
      defaultProd?: boolean;
      projectId: string;
    }): Promise<GetDeploymentInProjectByProjectIdResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { project_id: args.projectId },
        query: {
          defaultDev: args.defaultDev,
          defaultProd: args.defaultProd,
        },
        url: "/projects/{project_id}/deployment",
      });
      return readConvexManagementResult({
        endpoint,
        result: await getDeploymentInProjectByProjectId({
          client: generatedClient,
          path: { project_id: args.projectId },
          query: {
            defaultDev: args.defaultDev,
            defaultProd: args.defaultProd,
          },
        }),
        schemaName: "get deployment in project response",
      });
    },
    async getProject(args: {
      projectId: string;
    }): Promise<GetProjectByIdResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { project_id: args.projectId },
        url: "/projects/{project_id}",
      });
      return readConvexManagementResult({
        endpoint,
        result: await getProjectById({
          client: generatedClient,
          path: { project_id: args.projectId },
        }),
        schemaName: "get project response",
      });
    },
    async getTokenDetails(): Promise<GetTokenDetailsResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        url: "/token_details",
      });
      return readConvexManagementResult({
        endpoint,
        result: await getTokenDetails({ client: generatedClient }),
        schemaName: "get token details response",
      });
    },
    async listDeployments(args: {
      projectId: string;
    }): Promise<ListDeploymentsResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { project_id: args.projectId },
        url: "/projects/{project_id}/list_deployments",
      });
      return readConvexManagementResult({
        endpoint,
        result: await listDeployments({
          client: generatedClient,
          path: { project_id: args.projectId },
        }),
        schemaName: "list deployments response",
      });
    },
    async listProjects(args: {
      teamId: string;
    }): Promise<ListProjectsResponse> {
      const endpoint = formatEndpoint(generatedClient, {
        path: { team_id: args.teamId },
        url: "/teams/{team_id}/list_projects",
      });
      return readConvexManagementResult({
        endpoint,
        result: await listProjects({
          client: generatedClient,
          path: { team_id: args.teamId },
        }),
        schemaName: "list projects response",
      });
    },
  };
}

function readConvexManagementAccessToken(token: string): string {
  if (!token) {
    throw new Error("Convex access token is required.");
  }
  return token;
}

async function fetchConvexManagementApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_MANAGEMENT_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Convex Management API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatEndpoint(
  client: Client,
  args: ConvexManagementEndpointArgs,
): string {
  const url = client.buildUrl(args);
  return url.startsWith(CONVEX_MANAGEMENT_BASE_URL)
    ? url.slice(CONVEX_MANAGEMENT_BASE_URL.length)
    : url;
}

function readConvexManagementResult<T>(args: {
  endpoint: string;
  result: ConvexManagementResult<T>;
  schemaName: string;
}): T {
  if (args.result.data !== undefined) {
    return args.result.data;
  }

  if (args.result.response?.ok) {
    throw new Error(
      `Convex API response for ${args.endpoint} did not match ${args.schemaName}: ${formatResponseValidationError(args.result.error)}`,
    );
  }

  if (args.result.response) {
    throw new ConvexManagementApiError({
      status: args.result.response.status,
      path: args.endpoint,
      responseBodySummary: toErrorMessage(
        args.result.error,
        "No error details returned",
      ),
    });
  }

  throw new Error(
    `Convex API request failed before receiving a response for ${args.endpoint}: ${toErrorMessage(args.result.error)}`,
  );
}

function formatResponseValidationError(error: unknown): string {
  const issues = readValidationIssues(error);
  if (issues.length === 0) {
    return toErrorMessage(error, "unknown validation error");
  }
  return issues.map(formatValidationIssue).join("; ");
}

function readValidationIssues(error: unknown): unknown[] {
  if (!isRecord(error)) {
    return [];
  }
  const issues = error.issues;
  return Array.isArray(issues) ? issues : [];
}

function formatValidationIssue(issue: unknown): string {
  if (!isRecord(issue)) {
    return "/ failed validation";
  }
  const path = readValidationIssuePath(issue);
  const message = readString(issue, "message") ?? "failed validation";
  return `${path} ${message}`;
}

function readValidationIssuePath(issue: Record<string, unknown>): string {
  const path = issue.path;
  if (!Array.isArray(path) || path.length === 0) {
    return "/";
  }
  return `/${path.map(formatValidationPathSegment).join("/")}`;
}

function formatValidationPathSegment(segment: unknown): string {
  if (typeof segment === "string" || typeof segment === "number") {
    return String(segment);
  }
  return "?";
}
