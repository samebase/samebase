export function buildCloudflareBuildLogsUrl(args: {
  accountId: string;
  workerName: string;
  buildUuid: string;
}): string {
  return `https://dash.cloudflare.com/${encodeURIComponent(args.accountId)}/workers/services/view/${encodeURIComponent(args.workerName)}/production/builds/${encodeURIComponent(args.buildUuid)}`;
}

export function buildConvexDeploymentDashboardUrl(args: {
  teamSlug: string;
  projectSlug: string;
  deploymentName: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/${encodeURIComponent(args.deploymentName)}`;
}
