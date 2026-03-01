import { isRecord, readString } from "./jsonUtils";

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

type FetchRailwayConnectionDetailsOptions = {
  invalidApiKeyMessage: string;
  queryName: string;
  timeoutMs?: number;
};

export type RailwayConnectionDetails = {
  accountId: string;
  email?: string;
  name?: string;
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRailwayConnectionDetails(
  token: string,
  options: FetchRailwayConnectionDetailsOptions,
): Promise<RailwayConnectionDetails> {
  const response = await fetchWithTimeout(
    RAILWAY_GRAPHQL_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query ${options.queryName} { me { id email name } }`,
      }),
    },
    options.timeoutMs,
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    throw new Error(options.invalidApiKeyMessage);
  }

  const graphQlErrors = payload["errors"];
  if (Array.isArray(graphQlErrors) && graphQlErrors.length > 0) {
    throw new Error(options.invalidApiKeyMessage);
  }

  const data = payload["data"];
  if (!isRecord(data)) {
    throw new Error("Railway API key response is missing data");
  }
  const me = data["me"];
  if (!isRecord(me)) {
    throw new Error("Railway API key response is missing user profile");
  }
  const accountId = readString(me, "id");
  if (!accountId) {
    throw new Error("Railway API key response is missing account ID");
  }

  return {
    accountId,
    email: readString(me, "email"),
    name: readString(me, "name"),
  };
}
