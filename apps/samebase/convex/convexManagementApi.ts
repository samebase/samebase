import * as Credentials from "@distilled.cloud/convex/Credentials";
import type { ConvexOpContext } from "@distilled.cloud/convex/Protocol";
import * as Retry from "@distilled.cloud/convex/Retry";
import * as management from "@distilled.cloud/convex/management";
import { ResponseValidation } from "@distilled.cloud/core";
import { guard } from "@samebase/dependent/main";
import { Effect, Layer, Redacted, type Schema } from "effect";
import { FetchHttpClient } from "effect/http";

const API_PATH_PREFIX = "/v1";
const TIMEOUT = "10 seconds";

export type ConvexProject = management.ProjectResponse;
export type ConvexDeployment = management.PlatformDeploymentResponse;
export type ConvexCloudDeployment = Extract<ConvexDeployment, { kind: "cloud" }>;

export const isConvexCloudDeployment = guard<ConvexDeployment, ConvexCloudDeployment>(
  (deployment) => (deployment.kind === "cloud" ? deployment : null),
);

/**
A failed Convex Management API call. `status` is the HTTP status, or null when no answer came. The
message names the route with its IDs replaced and the distilled error tag, never the response body.
*/
export class ConvexManagementApiError extends Error {
  readonly status: number | null;

  constructor(args: { status: number | null; message: string }) {
    super(args.message);
    this.name = "ConvexManagementApiError";
    this.status = args.status;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}

/** A team or project ID as the Management API takes it. Samebase stores these IDs as strings. */
export function toConvexId(value: string, label: string): number {
  const id = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(id)) {
    throw new Error(`${label} must be a decimal identifier.`);
  }
  return id;
}

/**
A team or project ID from a response, as Samebase stores it. The distilled schemas of union
responses (token details, deployments) accept any value, so a caller checks the IDs it reads.
*/
export function readConvexId(value: number, label: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a decimal identifier.`);
  }
  return String(value);
}

function readRoute(request: Request): string {
  const path = new URL(request.url).pathname
    .slice(API_PATH_PREFIX.length)
    .replace(/^\/teams\/[^/]+/, "/teams/{team_id}")
    .replace(/^\/projects\/[^/]+/, "/projects/{project_id}")
    .replace(/^\/deployments\/[^/]+/, "/deployments/{deployment_name}");
  return `${request.method} ${path}`;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "unknown error";
  return "_tag" in error && typeof error._tag === "string" ? error._tag : "unknown error";
}

/** A distilled Convex operation with the schema of its result. */
type ConvexOperation<I, O, E> = ((input: I) => Effect.Effect<O, E, ConvexOpContext>) & {
  readonly output: Schema.Codec<O, unknown>;
};

/**
Runs one `@distilled.cloud/convex` operation with `token`, without retries and with a 10-second
limit. The JSON body of a successful answer must match the operation's schema: the distilled
Convex protocol returns a response as read and never checks it, even with a validation mode. A
failure rejects with a ConvexManagementApiError:
distilled errors can quote the response body, and Convex logs an exception that leaves an action.
*/
export async function runConvexManagement<I, O, E>(
  token: string,
  operation: ConvexOperation<I, O, E>,
  input: I,
): Promise<O> {
  if (!token) throw new Error("Convex access token is required.");
  let route = "request";
  let status: number | null = null;
  // The JSON of the last successful answer. delete_deploy_key answers with an empty body.
  let body: { json: unknown } | null = null;
  // Read at call time: Effect caches its default fetch on first use, which would keep test stubs.
  const send = globalThis.fetch;
  const fetchRecordingStatus = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    route = readRoute(request);
    const response = await send(request);
    status = response.status;
    if (!response.ok) return response;
    const text = await response.text();
    body = text ? { json: JSON.parse(text) } : null;
    return new Response(text || null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return await operation(input).pipe(
    Effect.tap(() =>
      body === null
        ? Effect.void
        : ResponseValidation.validateResponse(
            operation.output.ast,
            body.json,
            () => "ResponseSchemaMismatch",
          ),
    ),
    Retry.none,
    Effect.timeout(TIMEOUT),
    Effect.mapError(
      (error) =>
        new ConvexManagementApiError({
          status: status !== null && status >= 400 ? status : null,
          message: `Convex Management API ${route} failed${status === null ? "" : ` (${status})`}: ${describeError(error)}.`,
        }),
    ),
    Effect.provide(
      Layer.mergeAll(
        FetchHttpClient.layer,
        Layer.succeed(FetchHttpClient.Fetch, fetchRecordingStatus),
        Credentials.fromToken(Redacted.make(token)),
        ResponseValidation.additionalProperties,
      ),
    ),
    Effect.runPromise,
  );
}

export async function fetchConvexTeamTokenDetails(token: string): Promise<{ teamId: string }> {
  const details = await runConvexManagement(token, management.getTokenDetails, {});
  if (details.type !== "teamToken") {
    throw new Error("Convex token is missing team access.");
  }
  return { teamId: readConvexId(details.teamId, "Convex token team ID") };
}

/** One cheap read against the team: the token can list the team's projects. */
export async function verifyConvexTeamAccessToken(args: {
  token: string;
  teamId: string;
}): Promise<void> {
  await runConvexManagement(args.token, management.listProjects, {
    teamId: toConvexId(args.teamId, "Convex team ID"),
    limit: 1,
  });
}

export async function listConvexManagementProjects(args: {
  token: string;
  teamId: string;
}): Promise<ConvexProject[]> {
  const teamId = toConvexId(args.teamId, "Convex team ID");
  const projects: ConvexProject[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await runConvexManagement(args.token, management.listProjects, {
      teamId,
      cursor,
      limit: 100,
    });
    projects.push(...page.items);
    if (!page.pagination.hasMore) return projects;
    if (!page.pagination.nextCursor) {
      throw new Error("Convex project pagination indicated more results without a cursor.");
    }
    cursor = page.pagination.nextCursor;
  }
}
