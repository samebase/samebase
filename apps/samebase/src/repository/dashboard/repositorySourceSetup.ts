import type { api } from "../../../convex/_generated/api";

type RepositoryDashboardRepository = NonNullable<
  (typeof api.repository.list)["_returnType"]
>[number];
export type RepositoryDashboardSourceSetup = RepositoryDashboardRepository["sourceSetup"];
export type RepositoryDashboardSourceSetupStep = Extract<
  RepositoryDashboardSourceSetup,
  { status: "failed" | "running" }
>["step"];

/**
True while setup can still push the first commit, so GitHub would answer that the default branch has
none. A repository_actions setup reports its source as ready before it pushes the starter, so its
steps up to the seed count too. The repository row is live, so the read starts after the push.
*/
export function isWaitingForFirstCommit(
  repository: Pick<RepositoryDashboardRepository, "providerSetup" | "sourceSetup">,
): boolean {
  const { providerSetup, sourceSetup } = repository;
  return (
    sourceSetup.status === "running" ||
    (providerSetup.status === "running" &&
      (providerSetup.step === "write_actions_secrets" || providerSetup.step === "seed_starter"))
  );
}

export function formatRepositorySourceSetupStep(step: RepositoryDashboardSourceSetupStep): string {
  switch (step) {
    case "run_created":
      return "Starting setup";
    case "initialize_repository":
      return "Preparing repository";
    case "validate_connections":
      return "Checking provider connections";
    case "create_github_repository":
      return "Creating GitHub repository";
    case "fetch_github_repository":
      return "Reading GitHub repository";
    case "connect_github_repository":
      return "Connecting GitHub repository";
    case "seed_starter":
      return "Adding starter files";
    case "sync_tree":
      return "Syncing repository files";
  }
}
