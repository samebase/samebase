import type {
  PlatformCreateDeployKeyArgs,
  PlatformCreateDeployKeyResponse,
  PlatformCreateDeploymentArgs,
  PlatformCreateProjectArgs,
  PlatformCreateProjectResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
  PlatformTokenDetailsResponse,
} from "./convexManagementApiTypes.generated";
import {
  ajvConvexOAuthTokenResponse,
  ajvPlatformCreateDeployKeyResponse,
  ajvPlatformCreateProjectResponse,
  ajvPlatformDeploymentResponse,
  ajvPlatformDeploymentResponseList,
  ajvPlatformProjectDetailsList,
  ajvPlatformTokenDetailsResponse,
  type AjvStandaloneValidateFunction,
  type AjvStandaloneValidationError,
} from "./convexManagementApiValidators.generated";
import { toErrorMessage } from "./jsonUtils";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";

type ConvexManagementRequestMethod = "GET" | "POST";

export type ConvexCloudDeployment = Extract<
  PlatformDeploymentResponse,
  { kind: "cloud" }
>;

export type ConvexOAuthTokenResponse = {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

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

export class ConvexManagementApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly responseBodySummary: string;

  constructor(args: {
    status: number;
    path: string;
    responseBodySummary: string;
  }) {
    super(
      `Convex API request failed (${args.status}) for ${args.path}: ${args.responseBodySummary}`,
    );
    this.name = "ConvexManagementApiError";
    this.status = args.status;
    this.path = args.path;
    this.responseBodySummary = args.responseBodySummary;
  }
}

export class ConvexApiValidationError extends Error {
  readonly path: string;

  readonly schemaName: string;

  readonly validationErrors: readonly string[];

  constructor(args: {
    path: string;
    schemaName: string;
    validationErrors: readonly string[];
  }) {
    super(
      `Convex API response for ${args.path} did not match ${args.schemaName}: ${args.validationErrors.join("; ")}`,
    );
    this.name = "ConvexApiValidationError";
    this.path = args.path;
    this.schemaName = args.schemaName;
    this.validationErrors = args.validationErrors;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}

export function isConvexCloudDeployment(
  deployment: PlatformDeploymentResponse,
): deployment is ConvexCloudDeployment {
  return deployment.kind === "cloud";
}

export function parseConvexOAuthTokenResponse(
  payload: unknown,
): ConvexOAuthTokenResponse {
  const tokenResponse = validatePayload({
    path: "/oauth/token",
    schemaName: "ConvexOAuthTokenResponse",
    validator: ajvConvexOAuthTokenResponse,
    payload,
  });
  if (tokenResponse.access_token.length === 0) {
    throw new ConvexApiValidationError({
      path: "/oauth/token",
      schemaName: "ConvexOAuthTokenResponse",
      validationErrors: ["/access_token must be non-empty"],
    });
  }
  if (tokenResponse.token_type.length === 0) {
    throw new ConvexApiValidationError({
      path: "/oauth/token",
      schemaName: "ConvexOAuthTokenResponse",
      validationErrors: ["/token_type must be non-empty"],
    });
  }
  return tokenResponse;
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

export function createConvexManagementClient(args: {
  token?: string;
}): ConvexManagementClient {
  const token = args.token;
  if (!token) {
    throw new Error("Convex access token is required.");
  }

  return {
    async getTokenDetails() {
      const path = "/token_details";
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "GET",
      });
      return validatePayload({
        path,
        schemaName: "PlatformTokenDetailsResponse",
        validator: ajvPlatformTokenDetailsResponse,
        payload,
      });
    },
    async listProjects({ teamId }) {
      const path = `/teams/${encodeConvexNumericPathId(teamId, "Convex team ID")}/list_projects`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "GET",
      });
      return validatePayload({
        path,
        schemaName: "PlatformProjectDetails[]",
        validator: ajvPlatformProjectDetailsList,
        payload,
      });
    },
    async createProject({ teamId, body }) {
      const path = `/teams/${encodeConvexNumericPathId(teamId, "Convex team ID")}/create_project`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "POST",
        body,
      });
      return validatePayload({
        path,
        schemaName: "PlatformCreateProjectResponse",
        validator: ajvPlatformCreateProjectResponse,
        payload,
      });
    },
    async listDeployments({ projectId }) {
      const path = `/projects/${encodeConvexNumericPathId(projectId, "Convex project ID")}/list_deployments`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "GET",
      });
      return validatePayload({
        path,
        schemaName: "PlatformDeploymentResponse[]",
        validator: ajvPlatformDeploymentResponseList,
        payload,
      });
    },
    async createDeployment({ projectId, body }) {
      const path = `/projects/${encodeConvexNumericPathId(projectId, "Convex project ID")}/create_deployment`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "POST",
        body,
      });
      return validatePayload({
        path,
        schemaName: "PlatformDeploymentResponse",
        validator: ajvPlatformDeploymentResponse,
        payload,
      });
    },
    async getDeployment({ deploymentName }) {
      const path = `/deployments/${encodeConvexPathSegment(deploymentName, "Convex deployment name")}`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "GET",
      });
      return validatePayload({
        path,
        schemaName: "PlatformDeploymentResponse",
        validator: ajvPlatformDeploymentResponse,
        payload,
      });
    },
    async createDeployKey({ deploymentName, body }) {
      const path = `/deployments/${encodeConvexPathSegment(deploymentName, "Convex deployment name")}/create_deploy_key`;
      const payload = await requestConvexManagementApi({
        token,
        path,
        method: "POST",
        body,
      });
      return validatePayload({
        path,
        schemaName: "PlatformCreateDeployKeyResponse",
        validator: ajvPlatformCreateDeployKeyResponse,
        payload,
      });
    },
    async deleteProject({ projectId }) {
      await requestConvexManagementApi({
        token,
        path: `/projects/${encodeConvexNumericPathId(projectId, "Convex project ID")}/delete`,
        method: "POST",
      });
    },
    async deleteDeployment({ deploymentName }) {
      await requestConvexManagementApi({
        token,
        path: `/deployments/${encodeConvexPathSegment(deploymentName, "Convex deployment name")}/delete`,
        method: "POST",
      });
    },
  };
}

async function requestConvexManagementApi(args: {
  token: string;
  path: string;
  method: ConvexManagementRequestMethod;
  body?: unknown;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
  };
  if (args.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${CONVEX_MANAGEMENT_BASE_URL}${args.path}`, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new ConvexManagementApiError({
      status: response.status,
      path: args.path,
      responseBodySummary: toErrorMessage(payload, "No error details returned"),
    });
  }
  return payload;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function validatePayload<T>(args: {
  path: string;
  schemaName: string;
  validator: AjvStandaloneValidateFunction<T>;
  payload: unknown;
}): T {
  if (args.validator(args.payload)) {
    return args.payload;
  }

  throw new ConvexApiValidationError({
    path: args.path,
    schemaName: args.schemaName,
    validationErrors: formatValidationErrors(args.validator.errors),
  });
}

function formatValidationErrors(
  errors: AjvStandaloneValidationError[] | null | undefined,
): string[] {
  if (!errors || errors.length === 0) {
    return ["unknown validation error"];
  }
  return errors.map((error) => {
    const path = error.instancePath.length > 0 ? error.instancePath : "/";
    const message = error.message ?? "failed validation";
    return `${path} ${message}`;
  });
}

function encodeConvexNumericPathId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(`${label} must be a numeric identifier.`);
  }
  return encodeURIComponent(normalized);
}

function encodeConvexPathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return encodeURIComponent(normalized);
}
