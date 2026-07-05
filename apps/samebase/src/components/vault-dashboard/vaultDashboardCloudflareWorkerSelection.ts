export type CloudflareWorkerRepositoryEvidence =
  | { state: "none" }
  | {
      state: "matching_repo";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      rootDirectory: string;
    }
  | {
      state: "same_repo_different_root";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      rootDirectory: string;
      expectedRootDirectory: string;
    }
  | {
      state: "different_repo";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "deleted_repo_connection";
      repoId: string | null;
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "missing_repo_id";
      repoName: string | null;
      triggerName: string | null;
    }
  | {
      state: "missing_root_directory";
      repoId: string;
      repoName: string | null;
      triggerName: string | null;
      expectedRootDirectory: string;
    }
  | {
      state: "trigger_read_failed";
      message: string;
    };

export type CloudflareWorkerOption = {
  workerName: string;
  workerTag: string;
  discovery: {
    classification: "recommended" | "available" | "blocked" | "unknown";
    evidence: CloudflareWorkerRepositoryEvidence;
  };
};

export function isSelectableCloudflareWorker(worker: CloudflareWorkerOption): boolean {
  return (
    worker.discovery.classification === "recommended" ||
    worker.discovery.classification === "available"
  );
}

export function readDefaultCloudflareWorkerSelection(
  workers: readonly CloudflareWorkerOption[],
  selectedWorkerName: string,
): string {
  const selectedWorker = workers.find((worker) => worker.workerName === selectedWorkerName);
  if (selectedWorker && isSelectableCloudflareWorker(selectedWorker)) {
    return selectedWorker.workerName;
  }

  const recommendedWorkers = workers.filter(
    (worker) => worker.discovery.classification === "recommended",
  );
  if (recommendedWorkers.length === 1) {
    return recommendedWorkers[0].workerName;
  }

  return "";
}
