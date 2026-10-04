import type { BaseIssue } from "valibot";

const PROVIDER_RESPONSE_PARSE_LOG_TOPIC = "provider_response_parse_failed";
const PROVIDER_RESPONSE_LOG_VERSION = 1;

/**
Emit schema-derived validation details without provider values or response paths.

Valibot issues can contain provider values, paths, and messages, including
environment variable names.
Log only the schema's issue kind, type, and expected value description for Valibot.
*/
export function logProviderValidationFailure(args: {
  provider: "cloudflare" | "convex";
  phase: "request" | "response";
  method: string;
  path: string;
  transport: "direct" | "mcp" | null;
  issues: readonly Pick<BaseIssue<unknown>, "kind" | "type" | "expected">[];
}) {
  const topic =
    args.phase === "request"
      ? "provider_request_validation_failed"
      : "provider_response_validation_failed";
  console.error(
    `${topic} ${JSON.stringify({
      topic,
      version: PROVIDER_RESPONSE_LOG_VERSION,
      provider: args.provider,
      method: args.method,
      path: args.path,
      transport: args.transport,
      issue_count: args.issues.length,
      issues: args.issues.map(({ kind, type, expected }) => ({ kind, type, expected })),
    })}`,
  );
}

export function logProviderResponseParseFailure(args: {
  provider: "cloudflare" | "convex";
  method: string;
  path: string;
  transport: "direct" | "mcp" | null;
  reason: "invalid_json" | "non_object_response";
}) {
  console.error(
    `${PROVIDER_RESPONSE_PARSE_LOG_TOPIC} ${JSON.stringify({
      topic: PROVIDER_RESPONSE_PARSE_LOG_TOPIC,
      version: PROVIDER_RESPONSE_LOG_VERSION,
      provider: args.provider,
      method: args.method,
      path: args.path,
      transport: args.transport,
      reason: args.reason,
    })}`,
  );
}
