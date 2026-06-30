# Samebase Convex Function Usage Attribution

Samebase uses Convex log streams in PostHog to inspect shared `samebase.com` function execution
usage by user. This is for visibility and pricing research, not an automatic billing ledger or a
complete accounting source.

## Source Events

Convex emits a `function_execution` event after each query, mutation, action, and HTTP action. The
event includes the resource fields Convex recommends for usage attribution, including database IO
bytes, read documents, execution time, memory, file storage bytes, network egress, text search
bytes, and vector search bytes.

Reference: [Convex usage attribution](https://docs.convex.dev/platform-apis/track-usage).

PostHog Logs receives those events when the production Convex deployment has the PostHog Logs
integration enabled in the Convex dashboard. Validate that the service appears in PostHog before
using these rollups.

Reference: [PostHog Logs](https://posthog.com/docs/logs).

## Attribution Marker

Samebase also emits a compact console marker named `samebase_usage_context`. In the Convex log
stream payloads observed in PostHog, Convex attaches `function.request_id` to both console markers
and the related `function_execution` events, so PostHog can join the user context to the usage
counters.

The marker is emitted from:

- `apps/samebase/convex/functions.ts` for app-owned queries, mutations, and actions that use the
  Samebase function builders.
- `apps/samebase/convex/mcp/http.ts` for the `/mcp` HTTP action, which bypasses those builders.

The payload intentionally contains only internal attribution fields. MCP method and tool dimensions
are normalized to closed values before logging:

```json
{
  "topic": "samebase_usage_context",
  "version": 1,
  "surface": "app_function",
  "function_kind": "query",
  "samebase_user_id": "users_...",
  "viewer_role": "role_member",
  "required_access": "access_dashboard",
  "mcp_method": null,
  "mcp_tool_name": null,
  "mcp_is_notification": null
}
```

It must not include emails, tokens, provider account IDs, repository paths, file paths, or
prompt/user content because Convex forwards console output to external log streams.

## How To Inspect Usage

In PostHog Logs, filter the production Convex service, for example `samebase-convex-prod`, to:

- `topic:"function_execution"` to inspect raw Convex resource counters.
- `samebase_usage_context` to inspect Samebase user attribution markers.

Use `function.request_id` as the join key. First reduce `samebase_usage_context` markers to one user
context per request id, then sum the related `function_execution.usage` fields by
`samebase_user_id`. Also compute unattributed `function_execution` totals with no matching marker;
per-user sums are lower bounds until that unattributed bucket is small enough for the decision at
hand.

Known unmatched classes include cached query executions where the query body did not run, scheduled
or cron work that starts a new request, internal-only functions, and access-denied requests that
fail before the marker is emitted. Track attributed vs unattributed usage as a data-quality metric.

PostHog SQL insights can query log data; the available table names and columns are visible from the
PostHog SQL tab in the project.

Reference: [PostHog SQL](https://posthog.com/docs/sql).
