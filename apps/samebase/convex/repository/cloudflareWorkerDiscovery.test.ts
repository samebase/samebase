import { describe, expect, it } from "vite-plus/test";

import { toCloudflareWorkerDiscovery } from "./cloudflareWorkerDiscovery";

// State axes: recorded on this Samebase app (yes or no) x Cloudflare repository discovery state.
const cases = [
  {
    repository: { state: "ready", rootDirectory: "apps/web", builds: { state: "available" } },
    unattached: { attachment: "attachable", rootDirectory: "apps/web" },
  },
  { repository: { state: "not_connected" }, unattached: { attachment: "connectable" } },
  {
    repository: { state: "connected_elsewhere" },
    unattached: { attachment: "connected_elsewhere" },
  },
  {
    repository: { state: "ambiguous", reason: "multiple_root_directories" },
    unattached: { attachment: "unavailable" },
  },
  {
    repository: { state: "failed", message: "Cloudflare API request failed." },
    unattached: { attachment: "unavailable" },
  },
] as const;

describe("toCloudflareWorkerDiscovery", () => {
  it.each(cases)(
    "decides the attachment status of a $repository.state Worker",
    ({ repository, unattached }) => {
      const worker = { workerName: "web", workerTag: "web-tag", repository };

      expect(toCloudflareWorkerDiscovery(worker, new Set(["web-tag"]))).toEqual({
        attachment: "attached",
        workerName: "web",
        workerTag: "web-tag",
      });
      expect(toCloudflareWorkerDiscovery(worker, new Set(["other-tag"]))).toEqual({
        ...unattached,
        workerName: "web",
        workerTag: "web-tag",
      });
    },
  );
});
