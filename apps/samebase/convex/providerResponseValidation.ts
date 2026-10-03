import type { BaseIssue } from "valibot";

const PROVIDER_RESPONSE_PARSE_LOG_TOPIC = "provider_response_parse_failed";
const PROVIDER_RESPONSE_LOG_VERSION = 1;

type ProviderResponseValidationIssue =
  | {
      schemaPath: string;
      keyword?: string;
      message?: string;
    }
  | Pick<BaseIssue<unknown>, "kind" | "type" | "expected">;

/**
Emit schema-derived validation details without provider values or response paths.

AJV instance paths and params can contain provider data, such as environment
variable names. Valibot issues contain input values, paths, and messages too.
Log only the schema's issue kind, type, and expected value description for Valibot.
*/
export function logProviderValidationFailure(args: {
  provider: "cloudflare" | "convex";
  phase: "request" | "response";
  method: string;
  path: string;
  transport: "direct" | "mcp" | null;
  issues: readonly ProviderResponseValidationIssue[];
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
      issues: args.issues.map((issue) =>
        "schemaPath" in issue
          ? {
              schema_path: issue.schemaPath,
              keyword: issue.keyword ?? null,
              message: issue.message ?? null,
            }
          : { kind: issue.kind, type: issue.type, expected: issue.expected },
      ),
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
