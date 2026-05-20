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

type ConvexManagementOperationMethod =
  | "delete"
  | "get"
  | "head"
  | "options"
  | "patch"
  | "post"
  | "put"
  | "trace";
type ConvexManagementPath = keyof paths;
type ConvexManagementMethodForPath<Path extends ConvexManagementPath> = {
  [Method in ConvexManagementOperationMethod]: Method extends keyof paths[Path]
    ? NonNullable<paths[Path][Method]> extends never
      ? never
      : Uppercase<Method>
    : never;
}[ConvexManagementOperationMethod];
type ConvexManagementOperation<
  Path extends ConvexManagementPath,
  Method extends ConvexManagementMethodForPath<Path>,
> = NonNullable<paths[Path][Lowercase<Method> & keyof paths[Path]]>;
type PresentOpenApiField<T> = Exclude<T, undefined>;
type ConvexManagementPathParameters<Operation> = Operation extends {
  parameters: { path: infer PathParameters };
}
  ? PresentOpenApiField<PathParameters>
  : Operation extends { parameters: { path?: infer PathParameters } }
    ? PresentOpenApiField<PathParameters>
    : never;
type ConvexManagementQueryParameters<Operation> = Operation extends {
  parameters: { query: infer QueryParameters };
}
  ? PresentOpenApiField<QueryParameters>
  : Operation extends { parameters: { query?: infer QueryParameters } }
    ? PresentOpenApiField<QueryParameters>
    : never;
type ConvexManagementRequestParameters<Operation> = [
  ConvexManagementPathParameters<Operation>,
] extends [never]
  ? [ConvexManagementQueryParameters<Operation>] extends [never]
    ? { params?: never }
    : { params?: { query?: ConvexManagementQueryParameters<Operation> } }
  : {
      params: {
        path: ConvexManagementPathParameters<Operation>;
      } & ([ConvexManagementQueryParameters<Operation>] extends [never]
        ? { query?: never }
        : { query?: ConvexManagementQueryParameters<Operation> });
    };
type ConvexManagementJsonBody<Operation> = Operation extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Body
  : never;
type ConvexManagementRequestBody<Operation> = [
  ConvexManagementJsonBody<Operation>,
] extends [never]
  ? { body?: never }
  : { body: ConvexManagementJsonBody<Operation> };
type ConvexManagementJsonResponse<Operation> = Operation extends {
  responses: { 200: { content: { "application/json": infer Response } } };
}
  ? Response
  : Operation extends {
        responses: { 201: { content: { "application/json": infer Response } } };
      }
    ? Response
    : Operation extends {
          responses: {
            204: { content: { "application/json": infer Response } };
          };
        }
      ? Response
      : never;
type ConvexManagementApiRequestArgs<
  Path extends ConvexManagementPath,
  Method extends ConvexManagementMethodForPath<Path>,
> = {
  token: string;
  path: Path;
  method: Method;
} & ConvexManagementRequestParameters<ConvexManagementOperation<Path, Method>> &
  ConvexManagementRequestBody<ConvexManagementOperation<Path, Method>>;
type ConvexManagementApiEndpointArgs<
  Path extends ConvexManagementPath,
  Method extends ConvexManagementMethodForPath<Path>,
> = {
  path: Path;
  method: Method;
} & ConvexManagementRequestParameters<ConvexManagementOperation<Path, Method>>;
type ConvexManagementValidatedRequestArgs<
  Path extends ConvexManagementPath,
  Method extends ConvexManagementMethodForPath<Path>,
> = ConvexManagementApiRequestArgs<Path, Method> & {
  validator: AjvStandaloneValidateFunction<
    ConvexManagementJsonResponse<ConvexManagementOperation<Path, Method>>
  >;
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
  const Path extends ConvexManagementPath,
  const Method extends ConvexManagementMethodForPath<Path>,
>(args: ConvexManagementApiEndpointArgs<Path, Method>): string {
  return buildConvexManagementApiPath(args.path, args.params);
}

function formatConvexManagementApiOperation<
  const Path extends ConvexManagementPath,
  const Method extends ConvexManagementMethodForPath<Path>,
>(args: ConvexManagementApiEndpointArgs<Path, Method>): string {
  return `${args.method} ${args.path} response`;
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
      return await requestValidatedConvexManagementApi({
        token,
        path: "/token_details",
        method: "GET",
        validator: ajvPlatformTokenDetailsResponse,
      });
    },
    async listProjects({ teamId }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/teams/{team_id}/list_projects",
        method: "GET",
        params: {
          path: {
            team_id: parseConvexManagementNumericPathId(
              teamId,
              "Convex team ID",
            ),
          },
        },
        validator: ajvPlatformProjectDetailsList,
      });
    },
    async createProject({ teamId, body }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/teams/{team_id}/create_project",
        method: "POST",
        params: {
          path: {
            team_id: parseConvexManagementNumericPathId(
              teamId,
              "Convex team ID",
            ),
          },
        },
        body,
        validator: ajvPlatformCreateProjectResponse,
      });
    },
    async listDeployments({ projectId }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/projects/{project_id}/list_deployments",
        method: "GET",
        params: {
          path: {
            project_id: parseConvexManagementNumericPathId(
              projectId,
              "Convex project ID",
            ),
          },
        },
        validator: ajvPlatformDeploymentResponseList,
      });
    },
    async createDeployment({ projectId, body }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/projects/{project_id}/create_deployment",
        method: "POST",
        params: {
          path: {
            project_id: parseConvexManagementNumericPathId(
              projectId,
              "Convex project ID",
            ),
          },
        },
        body,
        validator: ajvPlatformDeploymentResponse,
      });
    },
    async getDeployment({ deploymentName }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/deployments/{deployment_name}",
        method: "GET",
        params: {
          path: {
            deployment_name: readConvexManagementPathSegment(
              deploymentName,
              "Convex deployment name",
            ),
          },
        },
        validator: ajvPlatformDeploymentResponse,
      });
    },
    async createDeployKey({ deploymentName, body }) {
      return await requestValidatedConvexManagementApi({
        token,
        path: "/deployments/{deployment_name}/create_deploy_key",
        method: "POST",
        params: {
          path: {
            deployment_name: readConvexManagementPathSegment(
              deploymentName,
              "Convex deployment name",
            ),
          },
        },
        body,
        validator: ajvPlatformCreateDeployKeyResponse,
      });
    },
    async deleteProject({ projectId }) {
      await requestConvexManagementApi({
        token,
        path: "/projects/{project_id}/delete",
        method: "POST",
        params: {
          path: {
            project_id: parseConvexManagementNumericPathId(
              projectId,
              "Convex project ID",
            ),
          },
        },
      });
    },
    async deleteDeployment({ deploymentName }) {
      await requestConvexManagementApi({
        token,
        path: "/deployments/{deployment_name}/delete",
        method: "POST",
        params: {
          path: {
            deployment_name: readConvexManagementPathSegment(
              deploymentName,
              "Convex deployment name",
            ),
          },
        },
      });
    },
  };
}

async function requestValidatedConvexManagementApi<
  const Path extends ConvexManagementPath,
  const Method extends ConvexManagementMethodForPath<Path>,
>(
  args: ConvexManagementValidatedRequestArgs<Path, Method>,
): Promise<
  ConvexManagementJsonResponse<ConvexManagementOperation<Path, Method>>
> {
  const payload = await requestConvexManagementApi(args);
  return validatePayload({
    path: formatConvexManagementApiEndpoint(args),
    schemaName: formatConvexManagementApiOperation(args),
    validator: args.validator,
    payload,
  });
}

async function requestConvexManagementApi<
  const Path extends ConvexManagementPath,
  const Method extends ConvexManagementMethodForPath<Path>,
>(args: ConvexManagementApiRequestArgs<Path, Method>): Promise<unknown> {
  const path = formatConvexManagementApiEndpoint(args);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
  };
  if (args.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${CONVEX_MANAGEMENT_BASE_URL}${path}`, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new ConvexManagementApiError({
      status: response.status,
      path,
      responseBodySummary: toErrorMessage(payload, "No error details returned"),
    });
  }
  return payload;
}

function buildConvexManagementApiPath(
  pathTemplate: string,
  params?: { path?: object; query?: object },
): string {
  const path = fillConvexManagementApiPathTemplate(pathTemplate, params?.path);
  const query = encodeConvexManagementApiQuery(params?.query);
  return query.length === 0 ? path : `${path}?${query}`;
}

function fillConvexManagementApiPathTemplate(
  pathTemplate: string,
  pathParameters?: object,
): string {
  if (!pathParameters) {
    return pathTemplate;
  }

  let path = pathTemplate;
  const entries: [string, unknown][] = Object.entries(pathParameters);
  for (const [name, value] of entries) {
    path = path.replace(
      `{${name}}`,
      encodeConvexPathParameter(value, `Convex path parameter ${name}`),
    );
  }
  return path;
}

function encodeConvexManagementApiQuery(queryParameters?: object): string {
  if (!queryParameters) {
    return "";
  }

  const query: string[] = [];
  const entries: [string, unknown][] = Object.entries(queryParameters);
  for (const [name, value] of entries) {
    if (!value && value !== false && value !== 0) {
      continue;
    }
    query.push(
      `${encodeURIComponent(name)}=${encodeURIComponent(encodeConvexPrimitiveParameter(value, name))}`,
    );
  }
  return query.join("&");
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
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function encodeConvexPathParameter(value: unknown, label: string): string {
  return encodeURIComponent(encodeConvexPrimitiveParameter(value, label));
}

function encodeConvexPrimitiveParameter(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  throw new Error(`${label} must be a string, number, or boolean.`);
}
