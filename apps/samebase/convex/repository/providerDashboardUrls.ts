export function buildConvexDeploymentDashboardUrl(args: {
  teamSlug: string;
  projectSlug: string;
  deploymentName: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/${encodeURIComponent(args.deploymentName)}`;
}
