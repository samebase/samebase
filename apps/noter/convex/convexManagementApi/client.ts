import createOpenApiFetchClient, {
  createFinalURL,
  createQuerySerializer,
  defaultPathSerializer,
  type Client,
  type ClientPathsWithMethod,
  type FetchOptions,
} from "openapi-fetch";
import type {
  paths,
  PlatformCreateDeployKeyArgs,
  PlatformCreateDeployKeyResponse,
  PlatformCreateDeploymentArgs,
  PlatformCreateProjectArgs,
  PlatformCreateProjectResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
  PlatformTokenDetailsResponse,
} from "./types.generated";
import {
  ajvPlatformCreateDeployKeyResponse,
  ajvPlatformCreateProjectResponse,
  ajvPlatformDeploymentResponse,
  ajvPlatformDeploymentResponseList,
  ajvPlatformProjectDetailsList,
  ajvPlatformTokenDetailsResponse,
  type AjvStandaloneValidateFunction,
} from "./validators.generated";
import { toErrorMessage } from "../jsonUtils";
import { ConvexManagementApiError } from "./errors";
import { validatePayload } from "./payloadValidation";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";

type ConvexManagementOpenApiClient = Client<paths>;
type ConvexManagementGetEndpointArgs<
  Path extends ClientPathsWithMethod<ConvexManagementOpenApiClient, "get">,
> = {
  method: "GET";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["get"]>>, "params">;
type ConvexManagementPostEndpointArgs<
  Path extends ClientPathsWithMethod<ConvexManagementOpenApiClient, "post">,
> = {
  method: "POST";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["post"]>>, "params">;
type ConvexManagementOpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

export type ConvexCloudDeployment = Extract<
  PlatformDeploymentResponse,
  { kind: "cloud" }
>;

export interface ConvexManagementClient {
  getTokenDetails(): Promise<PlatformTokenDetailsResponse>;
  listProjects(args: { teamId: string }): Promise<PlatformProjectDetails[]>;
  createProject(args: {
    teamId: string;
    body: PlatformCreateProjectArgs;
  }): Promise<PlatformCreateProjectResponse>;
  listDeployments(args: {
    projectId: string;
  }): Promise<PlatformDeploymentResponse[]>;
  createDeployment(args: {
    projectId: string;
    body: PlatformCreateDeploymentArgs;
  }): Promise<PlatformDeploymentResponse>;
  getDeployment(args: {
    deploymentName: string;
  }): Promise<PlatformDeploymentResponse>;
  createDeployKey(args: {
    deploymentName: string;
    body: PlatformCreateDeployKeyArgs;
  }): Promise<PlatformCreateDeployKeyResponse>;
  deleteProject(args: { projectId: string }): Promise<void>;
  deleteDeployment(args: { deploymentName: string }): Promise<void>;
}

export function isConvexCloudDeployment(
  deployment: PlatformDeploymentResponse,
): deployment is ConvexCloudDeployment {
  return deployment.kind === "cloud";
}

export async function fetchConvexTeamTokenDetails(token: string): Promise<{
  teamId: string;
}> {
  const details = await createConvexManagementClient({
    token,
  }).getTokenDetails();
  if (details.type !== "teamToken") {
    throw new Error("Convex token is missing team access.");
  }
  return { teamId: String(details.teamId) };
}

export function formatConvexManagementApiEndpoint<
  const Path extends ClientPathsWithMethod<
    ConvexManagementOpenApiClient,
    "get"
  >,
>(args: ConvexManagementGetEndpointArgs<Path>): string;
export function formatConvexManagementApiEndpoint<
  const Path extends ClientPathsWithMethod<
    ConvexManagementOpenApiClient,
    "post"
  >,
>(args: ConvexManagementPostEndpointArgs<Path>): string;
export function formatConvexManagementApiEndpoint(args: {
  method: "GET" | "POST";
  path: string;
  params?: {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
}): string {
  return createFinalURL(args.path, {
    baseUrl: "",
    params: args.params ?? {},
    querySerializer: createQuerySerializer(),
    pathSerializer: serializeConvexManagementPath,
  });
}

export function createConvexManagementClient(args: {
  token?: string;
}): ConvexManagementClient {
  const token = args.token;
  if (!token) {
    throw new Error("Convex access token is required.");
  }

  const client = createOpenApiFetchClient<paths>({
    baseUrl: CONVEX_MANAGEMENT_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    pathSerializer: serializeConvexManagementPath,
  });

  return {
    async getTokenDetails() {
      const path = "/token_details";
      const result = await client.GET(path);
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "GET",
          path,
        }),
        method: "GET",
        path,
        validator: ajvPlatformTokenDetailsResponse,
      });
    },
    async listProjects({ teamId }) {
      const path = "/teams/{team_id}/list_projects";
      const params = {
        path: {
          team_id: parseConvexManagementNumericPathId(teamId, "Convex team ID"),
        },
      };
      const result = await client.GET(path, { params });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "GET",
          path,
          params,
        }),
        method: "GET",
        path,
        validator: ajvPlatformProjectDetailsList,
      });
    },
    async createProject({ teamId, body }) {
      const path = "/teams/{team_id}/create_project";
      const params = {
        path: {
          team_id: parseConvexManagementNumericPathId(teamId, "Convex team ID"),
        },
      };
      const result = await client.POST(path, { params, body });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "POST",
          path,
          params,
        }),
        method: "POST",
        path,
        validator: ajvPlatformCreateProjectResponse,
      });
    },
    async listDeployments({ projectId }) {
      const path = "/projects/{project_id}/list_deployments";
      const params = {
        path: {
          project_id: parseConvexManagementNumericPathId(
            projectId,
            "Convex project ID",
          ),
        },
      };
      const result = await client.GET(path, { params });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "GET",
          path,
          params,
        }),
        method: "GET",
        path,
        validator: ajvPlatformDeploymentResponseList,
      });
    },
    async createDeployment({ projectId, body }) {
      const path = "/projects/{project_id}/create_deployment";
      const params = {
        path: {
          project_id: parseConvexManagementNumericPathId(
            projectId,
            "Convex project ID",
          ),
        },
      };
      const result = await client.POST(path, { params, body });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "POST",
          path,
          params,
        }),
        method: "POST",
        path,
        validator: ajvPlatformDeploymentResponse,
      });
    },
    async getDeployment({ deploymentName }) {
      const path = "/deployments/{deployment_name}";
      const params = {
        path: {
          deployment_name: readConvexManagementPathSegment(
            deploymentName,
            "Convex deployment name",
          ),
        },
      };
      const result = await client.GET(path, { params });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "GET",
          path,
          params,
        }),
        method: "GET",
        path,
        validator: ajvPlatformDeploymentResponse,
      });
    },
    async createDeployKey({ deploymentName, body }) {
      const path = "/deployments/{deployment_name}/create_deploy_key";
      const params = {
        path: {
          deployment_name: readConvexManagementPathSegment(
            deploymentName,
            "Convex deployment name",
          ),
        },
      };
      const result = await client.POST(path, { params, body });
      return validateConvexManagementResult({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "POST",
          path,
          params,
        }),
        method: "POST",
        path,
        validator: ajvPlatformCreateDeployKeyResponse,
      });
    },
    async deleteProject({ projectId }) {
      const path = "/projects/{project_id}/delete";
      const params = {
        path: {
          project_id: parseConvexManagementNumericPathId(
            projectId,
            "Convex project ID",
          ),
        },
      };
      const result = await client.POST(path, { params });
      assertConvexManagementResultOk({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "POST",
          path,
          params,
        }),
      });
    },
    async deleteDeployment({ deploymentName }) {
      const path = "/deployments/{deployment_name}/delete";
      const params = {
        path: {
          deployment_name: readConvexManagementPathSegment(
            deploymentName,
            "Convex deployment name",
          ),
        },
      };
      const result = await client.POST(path, { params });
      assertConvexManagementResultOk({
        result,
        endpoint: formatConvexManagementApiEndpoint({
          method: "POST",
          path,
          params,
        }),
      });
    },
  };
}

function validateConvexManagementResult<T>(args: {
  result: ConvexManagementOpenApiResult<T>;
  endpoint: string;
  method: "GET" | "POST";
  path: string;
  validator: AjvStandaloneValidateFunction<T>;
}): T {
  assertConvexManagementResultOk({
    result: args.result,
    endpoint: args.endpoint,
  });
  return validatePayload({
    path: args.endpoint,
    schemaName: `${args.method} ${args.path} response`,
    validator: args.validator,
    payload: args.result.data,
  });
}

function assertConvexManagementResultOk(args: {
  result: {
    error?: unknown;
    response: Response;
  };
  endpoint: string;
}): void {
  if (args.result.response.ok) {
    return;
  }

  throw new ConvexManagementApiError({
    status: args.result.response.status,
    path: args.endpoint,
    responseBodySummary: toErrorMessage(
      args.result.error,
      "No error details returned",
    ),
  });
}

function serializeConvexManagementPath(
  pathname: string,
  pathParams: Record<string, unknown>,
): string {
  const normalizedPathParams: Record<string, unknown> = {};
  const entries: [string, unknown][] = Object.entries(pathParams);
  for (const [name, value] of entries) {
    normalizedPathParams[name] =
      typeof value === "string"
        ? readConvexManagementPathSegment(
            value,
            `Convex path parameter ${name}`,
          )
        : value;
  }
  return defaultPathSerializer(pathname, normalizedPathParams);
}

export function parseConvexManagementNumericPathId(
  value: string,
  label: string,
): number {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(`${label} must be a numeric identifier.`);
  }
  return Number(normalized);
}

export function readConvexManagementPathSegment(
  value: string,
  label: string,
): string {
  const normalized = value.trim();
  if (normalized !== value) {
    console.warn("convex:api:trimmed_path_parameter", {
      label,
      originalLength: value.length,
      normalizedLength: normalized.length,
    });
  }
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
