export function requireActiveConvexTeam(args: {
  activeTeamId: string;
  targetTeamId: string;
}): void {
  const activeTeamId = args.activeTeamId.trim();
  if (!activeTeamId || activeTeamId !== args.targetTeamId) {
    throw new Error("Reconnect the Convex team that owns this resource.");
  }
}
