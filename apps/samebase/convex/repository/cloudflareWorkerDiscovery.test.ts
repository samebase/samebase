import { describe, expect, it } from "vite-plus/test";

import { toCloudflareWorkerDiscovery } from "./cloudflareWorkerDiscovery";

// State axes: Samebase record (none, this app, another app) x Cloudflare repository discovery state.
const cases = [
  {
    repository: { state: "ready", rootDirectory: "apps/web", builds: { state: "available" } },
    unrecorded: { attachment: "attachable", rootDirectory: "apps/web" },
  },
  { repository: { state: "not_connected" }, unrecorded: { attachment: "connectable" } },
  {
    repository: { state: "connected_elsewhere" },
    unrecorded: { attachment: "connected_elsewhere" },
  },
  {
    repository: { state: "ambiguous", reason: "multiple_root_directories" },
    unrecorded: { attachment: "unavailable" },
  },
  {
    repository: { state: "failed", message: "Cloudflare API request failed." },
    unrecorded: { attachment: "unavailable" },
  },
] as const;

describe("toCloudflareWorkerDiscovery", () => {
  it.each(cases)(
    "decides the attachment status of a $repository.state Worker",
    ({ repository, unrecorded }) => {
      const worker = { workerName: "web", workerTag: "web-tag", repository };

      expect(toCloudflareWorkerDiscovery(worker, undefined)).toEqual({
        ...unrecorded,
        workerName: "web",
        workerTag: "web-tag",
      });
      expect(toCloudflareWorkerDiscovery(worker, "attached")).toEqual({
        attachment: "attached",
        workerName: "web",
        workerTag: "web-tag",
      });
      expect(toCloudflareWorkerDiscovery(worker, "attached_elsewhere")).toEqual({
        attachment: "attached_elsewhere",
        workerName: "web",
        workerTag: "web-tag",
      });
    },
  );
});
