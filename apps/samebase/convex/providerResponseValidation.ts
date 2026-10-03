const PROVIDER_RESPONSE_VALIDATION_LOG_TOPIC = "provider_response_validation_failed";
const PROVIDER_RESPONSE_PARSE_LOG_TOPIC = "provider_response_parse_failed";
const PROVIDER_RESPONSE_LOG_VERSION = 1;

type ProviderResponseValidationIssue =
  | {
      schemaPath: string;
      keyword?: string;
      message?: string;
    }
  | { code: string };

/**
Emit schema-derived validation details without provider values or response paths.

AJV instance paths and params can contain provider data, such as environment
variable names. Zod paths and messages can contain these values too. Log only
issue codes for Zod.
*/
export function logProviderResponseValidationFailure(args: {
  provider: "cloudflare" | "convex";
  method: string;
  path: string;
  transport: "direct" | "mcp" | null;
  issues: readonly ProviderResponseValidationIssue[];
}) {
  console.error(
    `${PROVIDER_RESPONSE_VALIDATION_LOG_TOPIC} ${JSON.stringify({
      topic: PROVIDER_RESPONSE_VALIDATION_LOG_TOPIC,
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
          : { code: issue.code },
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
