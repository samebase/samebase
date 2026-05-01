export type ProvisioningLogLevel = "info" | "warn" | "error";

export type ProvisioningLogStep =
  | "validate_connections"
  | "create_github_repo"
  | "seed_starter"
  | "create_vault"
  | "claim_infra"
  | "ensure_convex"
  | "ensure_convex_preview"
  | "ensure_cloudflare"
  | "record_domains"
  | "finish";

export type ProvisioningLogEvent = {
  createdAt: number;
  level: ProvisioningLogLevel;
  message: string;
  step: ProvisioningLogStep;
};

const provisioningStepLabels = {
  validate_connections: "validate connections",
  create_github_repo: "create GitHub repo",
  seed_starter: "seed starter",
  create_vault: "create vault",
  claim_infra: "claim infra",
  ensure_convex: "ensure Convex",
  ensure_convex_preview: "ensure Convex preview",
  ensure_cloudflare: "ensure Cloudflare",
  record_domains: "record domains",
  finish: "finish",
} satisfies Record<ProvisioningLogStep, string>;

function formatProvisioningTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function formatProvisioningLogLine(event: ProvisioningLogEvent): string {
  const level = event.level.toUpperCase().padEnd(5, " ");
  return `${formatProvisioningTimestamp(event.createdAt)} ${level} ${provisioningStepLabels[event.step]} - ${event.message}`;
}

export function formatProvisioningLogText(
  events: ProvisioningLogEvent[],
): string {
  return events.map(formatProvisioningLogLine).join("\n");
}
