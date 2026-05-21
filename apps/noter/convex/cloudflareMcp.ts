"use node";

import { asRecord, readString, toErrorMessage } from "./jsonUtils";

export const CLOUDFLARE_MCP_SERVER_URL = "https://mcp.cloudflare.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_TIMEOUT_MS = 30_000;

type JsonRpcId = number;

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type McpToolTextContent = {
  type: "text";
  text: string;
};

function resolveOriginHeader(): string {
  const siteUrl = process.env.SITE_URL ?? process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    return "https://noter.md";
  }
  try {
    return new URL(siteUrl).origin;
  } catch {
    return "https://noter.md";
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Cloudflare MCP request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
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
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function parseEventStreamPayload(payload: string): unknown[] {
  const messages: unknown[] = [];
  let dataLines: string[] = [];

  function flush() {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data) return;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // Ignore non-JSON event payloads.
    }
  }

  const lines = payload.split(/\r?\n/);
  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  flush();
  return messages;
}

function normalizeJsonRpcMessages(payload: unknown): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];

  const candidates: unknown[] =
    typeof payload === "string"
      ? parseEventStreamPayload(payload)
      : Array.isArray(payload)
        ? payload
        : [payload];

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (record["jsonrpc"] !== "2.0") continue;

    const idValue = record["id"];
    const id = typeof idValue === "number" ? idValue : undefined;
    const methodValue = record["method"];
    const method = typeof methodValue === "string" ? methodValue : undefined;

    messages.push({
      jsonrpc: "2.0",
      id,
      method,
      params: record["params"],
      result: record["result"],
      error: record["error"],
    });
  }

  return messages;
}

function findMessageById(
  messages: JsonRpcMessage[],
  id: JsonRpcId,
): JsonRpcMessage | undefined {
  return messages.find((msg) => msg.id === id);
}

function readJsonRpcErrorMessage(error: unknown): string {
  const record = asRecord(error);
  const message = readString(record, "message");
  if (message) return message;
  return payloadToString(error);
}

function extractToolText(result: unknown): {
  text: string;
  isError: boolean;
} {
  const record = asRecord(result);
  const isError = record["isError"] === true;
  const content = record["content"];
  if (!Array.isArray(content)) {
    return { text: payloadToString(result), isError };
  }

  const textChunks: string[] = [];
  for (const item of content) {
    const itemRecord = asRecord(item);
    if (
      itemRecord["type"] === "text" &&
      typeof itemRecord["text"] === "string"
    ) {
      const chunk: McpToolTextContent = {
        type: "text",
        text: itemRecord["text"],
      };
      textChunks.push(chunk.text);
    }
  }

  return { text: textChunks.join("\n").trim(), isError };
}

async function postJsonRpcMessage(args: {
  url: string;
  token: string;
  sessionId?: string;
  message: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{
  sessionId?: string;
  messages: JsonRpcMessage[];
}> {
  const origin = resolveOriginHeader();

  const response = await fetchWithTimeout(
    args.url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Origin: origin,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(args.sessionId ? { "Mcp-Session-Id": args.sessionId } : {}),
      },
      body: JSON.stringify(args.message),
    },
    args.timeoutMs,
  );

  const sessionId = response.headers.get("mcp-session-id") ?? undefined;

  if (response.status === 202) {
    return { sessionId, messages: [] };
  }

  const payload = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(
      `Cloudflare MCP request failed (${response.status}): ${payloadToString(payload)}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const normalizedPayload =
    contentType.includes("text/event-stream") && typeof payload === "string"
      ? payload
      : payload;
  const messages = normalizeJsonRpcMessages(normalizedPayload);
  return { sessionId, messages };
}

async function initializeSession(args: {
  url: string;
  token: string;
  timeoutMs?: number;
}): Promise<{ sessionId?: string }> {
  const initId = 1;
  const initializeMessage = {
    jsonrpc: "2.0",
    id: initId,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "noter",
        version: "0.0.0",
      },
    },
  };

  const initResponse = await postJsonRpcMessage({
    url: args.url,
    token: args.token,
    message: initializeMessage,
    timeoutMs: args.timeoutMs,
  });

  const initializeResultMessage = findMessageById(
    initResponse.messages,
    initId,
  );
  if (!initializeResultMessage) {
    throw new Error("Cloudflare MCP initialize response is missing result.");
  }
  if (initializeResultMessage.error) {
    throw new Error(readJsonRpcErrorMessage(initializeResultMessage.error));
  }

  const sessionId = initResponse.sessionId;

  await postJsonRpcMessage({
    url: args.url,
    token: args.token,
    sessionId,
    message: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
    timeoutMs: args.timeoutMs,
  });

  return { sessionId };
}

async function closeSession(args: {
  url: string;
  token: string;
  sessionId?: string;
  timeoutMs?: number;
}): Promise<void> {
  if (!args.sessionId) return;

  try {
    const response = await fetchWithTimeout(
      args.url,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${args.token}`,
          Origin: resolveOriginHeader(),
          "Mcp-Session-Id": args.sessionId,
        },
      },
      args.timeoutMs,
    );
    if (!response.ok && response.status !== 404) {
      // Best-effort close; ignore unsupported servers.
    }
  } catch {
    // Best-effort close; ignore network issues during teardown.
  }
}

export async function callCloudflareMcpTool(args: {
  token: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string> {
  const { sessionId } = await initializeSession({
    url: CLOUDFLARE_MCP_SERVER_URL,
    token: args.token,
    timeoutMs: args.timeoutMs,
  });

  try {
    const callId = 2;
    const toolCall = {
      jsonrpc: "2.0",
      id: callId,
      method: "tools/call",
      params: {
        name: args.toolName,
        arguments: args.toolArgs,
      },
    };

    const response = await postJsonRpcMessage({
      url: CLOUDFLARE_MCP_SERVER_URL,
      token: args.token,
      sessionId,
      message: toolCall,
      timeoutMs: args.timeoutMs,
    });

    const toolMessage = findMessageById(response.messages, callId);
    if (!toolMessage) {
      throw new Error("Cloudflare MCP tool call response is missing result.");
    }
    if (toolMessage.error) {
      throw new Error(readJsonRpcErrorMessage(toolMessage.error));
    }

    const { text, isError } = extractToolText(toolMessage.result);
    if (isError) {
      throw new Error(text || "Cloudflare MCP tool call failed.");
    }
    return text;
  } catch (error) {
    throw new Error(
      `Cloudflare MCP tool call failed: ${toErrorMessage(error)}`,
    );
  } finally {
    await closeSession({
      url: CLOUDFLARE_MCP_SERVER_URL,
      token: args.token,
      sessionId,
      timeoutMs: args.timeoutMs,
    });
  }
}
