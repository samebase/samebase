import createOpenApiFetchClient, {
  createFinalURL,
  createQuerySerializer,
  defaultPathSerializer,
  type Client,
  type ClientPathsWithMethod,
  type FetchOptions,
} from "openapi-fetch";
import { isLosslessNumber, isSafeNumber, parse } from "lossless-json";
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
import { ConvexApiValidationError, ConvexManagementApiError } from "./errors";
import { validatePayload } from "./payloadValidation";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";
const CONVEX_MANAGEMENT_TIMEOUT_MS = 10_000;
const CONVEX_MANAGEMENT_DECIMAL_ID_FIELDS: ReadonlySet<string> = new Set([
  "creator",
  "destinationProjectId",
  "id",
  "memberId",
  "projectId",
  "referredBy",
  "ssoTeamId",
  "teamId",
]);

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
  return { teamId: details.teamId };
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
  token: string;
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
    fetch: fetchConvexManagementApi,
    pathSerializer: serializeConvexManagementPath,
  });

  return {
    async getTokenDetails() {
      const path = "/token_details";
      const result = await client.GET(path, { parseAs: "text" });
      return validateConvexManagementJsonResult({
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
          team_id: readConvexManagementDecimalPathId(teamId, "Convex team ID"),
        },
      };
      const result = await client.GET(path, { params, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
          team_id: readConvexManagementDecimalPathId(teamId, "Convex team ID"),
        },
      };
      const result = await client.POST(path, { params, body, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
          project_id: readConvexManagementDecimalPathId(
            projectId,
            "Convex project ID",
          ),
        },
      };
      const result = await client.GET(path, { params, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
          project_id: readConvexManagementDecimalPathId(
            projectId,
            "Convex project ID",
          ),
        },
      };
      const result = await client.POST(path, { params, body, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
      const result = await client.GET(path, { params, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
      const result = await client.POST(path, { params, body, parseAs: "text" });
      return validateConvexManagementJsonResult({
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
          project_id: readConvexManagementDecimalPathId(
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

async function fetchConvexManagementApi(input: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_MANAGEMENT_TIMEOUT_MS);

  try {
    return await fetch(input, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Convex Management API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateConvexManagementJsonResult<T>(args: {
  result: ConvexManagementOpenApiResult<string>;
  endpoint: string;
  method: "GET" | "POST";
  path: string;
  validator: AjvStandaloneValidateFunction<T>;
}): T {
  const schemaName = `${args.method} ${args.path} response`;
  assertConvexManagementResultOk({
    result: args.result,
    endpoint: args.endpoint,
  });
  const payload = parseConvexManagementResponseJson({
    endpoint: args.endpoint,
    schemaName,
    text: args.result.data,
  });
  return validatePayload({
    path: args.endpoint,
    schemaName,
    validator: args.validator,
    payload,
  });
}

function parseConvexManagementResponseJson(args: {
  endpoint: string;
  schemaName: string;
  text?: string;
}): unknown {
  if (args.text === undefined) {
    throw new ConvexApiValidationError({
      path: args.endpoint,
      schemaName: args.schemaName,
      validationErrors: ["/ missing JSON response body"],
    });
  }

  try {
    return parse(args.text, reviveConvexManagementResponseValue);
  } catch (error) {
    throw new ConvexApiValidationError({
      path: args.endpoint,
      schemaName: args.schemaName,
      validationErrors: [
        `/ invalid JSON response: ${toErrorMessage(error, "parse failed")}`,
      ],
    });
  }
}

function reviveConvexManagementResponseValue(
  key: string,
  value: unknown,
): unknown {
  if (!isLosslessNumber(value)) {
    return value;
  }

  const serialized = value.toString();
  if (CONVEX_MANAGEMENT_DECIMAL_ID_FIELDS.has(key)) {
    return readConvexManagementDecimalValue(
      serialized,
      `Convex response field ${key}`,
    );
  }
  if (!isSafeNumber(serialized, { approx: false })) {
    throw new Error(
      `${key || "Convex response number"} is outside JavaScript's safe numeric range.`,
    );
  }
  return Number(serialized);
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

export function readConvexManagementDecimalPathId(
  value: string,
  label: string,
): string {
  return readConvexManagementDecimalValue(
    readConvexManagementPathSegment(value, label),
    label,
  );
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

function readConvexManagementDecimalValue(
  value: string,
  label: string,
): string {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a decimal identifier.`);
  }
  return value;
}
