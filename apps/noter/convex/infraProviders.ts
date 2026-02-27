type ConvexRequestMethod = "GET" | "POST";
type NetlifyRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type ProviderName = "Convex" | "Netlify";

export interface ConvexManagementProvider {
  request(
    path: string,
    method: ConvexRequestMethod,
    body?: unknown,
  ): Promise<unknown>;
}

export interface NetlifyManagementProvider {
  request(
    path: string,
    method: NetlifyRequestMethod,
    body?: unknown,
  ): Promise<unknown>;
}

export interface RailwayManagementProvider {
  request(query: string, variables?: Record<string, unknown>): Promise<unknown>;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
    return await response.text();
  } catch {
    return null;
  }
}

function payloadToString(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function requestProviderApi(args: {
  provider: ProviderName;
  baseUrl: string;
  token: string;
  path: string;
  method: ConvexRequestMethod | NetlifyRequestMethod;
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  if (!response.ok) {
    const payload = await parseResponseBody(response);
    throw new Error(
      `${args.provider} API request failed (${response.status}) for ${args.path}: ${payloadToString(payload)}`,
    );
  }

  return await parseResponseBody(response);
}

function readGraphQlErrors(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const errors = Reflect.get(payload, "errors");
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }
  const messages = errors
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return "";
      }
      const message = Reflect.get(entry, "message");
      return typeof message === "string" ? message : "";
    })
    .filter((value) => value.length > 0);
  if (messages.length === 0) {
    return "Unknown Railway GraphQL error";
  }
  return messages.join("; ");
}

function readGraphQlData(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "data")) {
    return null;
  }
  return Reflect.get(payload, "data");
}

async function requestRailwayGraphql(args: {
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: args.query,
      variables: args.variables,
    }),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(
      `Railway API request failed (${response.status}): ${payloadToString(payload)}`,
    );
  }

  const graphQlErrorMessage = readGraphQlErrors(payload);
  if (graphQlErrorMessage) {
    throw new Error(`Railway GraphQL error: ${graphQlErrorMessage}`);
  }

  const data = readGraphQlData(payload);
  if (data === null || data === undefined) {
    throw new Error("Railway API response is missing `data`.");
  }

  return data;
}

export function createInfraProviders(args?: {
  convexToken?: string;
  netlifyToken?: string;
  railwayToken?: string;
}): {
  convex: ConvexManagementProvider;
  netlify: NetlifyManagementProvider;
  railway: RailwayManagementProvider;
} {
  const convexTokenOverride = args?.convexToken;
  const netlifyTokenOverride = args?.netlifyToken;
  const railwayTokenOverride = args?.railwayToken;

  return {
    convex: {
      request(path, method, body) {
        const token = convexTokenOverride;
        if (!token) {
          throw new Error("Convex access token is required.");
        }
        return requestProviderApi({
          provider: "Convex",
          baseUrl: "https://api.convex.dev/v1",
          token,
          path,
          method,
          body,
        });
      },
    },
    netlify: {
      request(path, method, body) {
        const token = netlifyTokenOverride;
        if (!token) {
          throw new Error("Netlify access token is required.");
        }
        return requestProviderApi({
          provider: "Netlify",
          baseUrl: "https://api.netlify.com/api/v1",
          token,
          path,
          method,
          body,
        });
      },
    },
    railway: {
      request(query, variables) {
        const token = railwayTokenOverride;
        if (!token) {
          throw new Error("Railway access token is required.");
        }
        return requestRailwayGraphql({
          token,
          query,
          variables,
        });
      },
    },
  };
}
